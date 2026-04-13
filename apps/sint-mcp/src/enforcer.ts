/**
 * SINT MCP — Policy Enforcement Layer.
 *
 * Every tool call from the upstream MCP client passes through here
 * before reaching any downstream server. The enforcer maps tool calls
 * to SINT requests and routes them through the PolicyGateway.
 *
 * @module @sint/mcp/enforcer
 */

import { type SintRequest, type PolicyDecision, ApprovalTier } from "@pshkv/core";
import type { PolicyGateway } from "@pshkv/gate-policy-gateway";
import type { ApprovalQueue } from "@pshkv/gate-policy-gateway";
import { generateUUIDv7, nowISO8601 } from "@pshkv/gate-capability-tokens";
import { toResourceUri, toSintAction } from "@pshkv/bridge-mcp";
import type { MCPToolCall } from "@pshkv/bridge-mcp";
import type { ParsedNamespace } from "./aggregator.js";
import type { DownstreamManager } from "./downstream.js";
import type { TrajectoryRecorder } from "./trajectory.js";

/**
 * Ordered tier values for comparison.
 * Lower index = lower risk.
 */
const TIER_ORDER: readonly ApprovalTier[] = [
  ApprovalTier.T0_OBSERVE,
  ApprovalTier.T1_PREPARE,
  ApprovalTier.T2_ACT,
  ApprovalTier.T3_COMMIT,
];

/** Map config tier strings to ApprovalTier enum. */
const TIER_FROM_CONFIG: Record<string, ApprovalTier> = {
  T0_observe: ApprovalTier.T0_OBSERVE,
  T1_prepare: ApprovalTier.T1_PREPARE,
  T2_act: ApprovalTier.T2_ACT,
  T3_commit: ApprovalTier.T3_COMMIT,
};

function tierIndex(tier: ApprovalTier): number {
  return TIER_ORDER.indexOf(tier);
}

/** Result of enforcing policy on a tool call. */
export interface EnforcementResult {
  /** Whether the call was allowed. */
  readonly allowed: boolean;
  /** The policy decision. */
  readonly decision: PolicyDecision;
  /** If denied, the reason. */
  readonly denyReason?: string;
  /** If escalated, the approval request ID for tracking. */
  readonly approvalRequestId?: string;
  /** The downstream result (only if allowed and forwarded). */
  readonly result?: { content: Array<{ type: string; text?: string }>; isError?: boolean };
}

/**
 * Policy Enforcer — intercepts every tool call through SINT.
 *
 * @example
 * ```ts
 * const enforcer = new PolicyEnforcer(gateway, approvalQueue, downstream, agentId, tokenId);
 * const result = await enforcer.enforce(
 *   { serverName: "filesystem", toolName: "writeFile" },
 *   { path: "/tmp/test.txt", content: "hello" },
 * );
 * if (result.allowed) {
 *   // result.result contains the downstream response
 * }
 * ```
 */
export class PolicyEnforcer {
  private readonly recentActions: string[] = [];

  constructor(
    private readonly gateway: PolicyGateway,
    private readonly approvalQueue: ApprovalQueue,
    private readonly downstream: DownstreamManager,
    private readonly agentId: string,
    private readonly tokenId: string,
    private readonly trajectory?: TrajectoryRecorder,
  ) {}

  /**
   * Enforce SINT policy on a tool call.
   *
   * Flow:
   * 1. Map tool call to SintRequest
   * 2. PolicyGateway.intercept()
   * 3. allow → forward to downstream
   * 4. deny → return error
   * 5. escalate → enqueue and wait
   */
  async enforce(
    parsed: ParsedNamespace,
    args: Record<string, unknown>,
  ): Promise<EnforcementResult> {
    const startedAtMs = Date.now();
    const parentEventId =
      typeof args["parentEventId"] === "string"
        ? args["parentEventId"]
        : undefined;
    const tool = `${parsed.serverName}.${parsed.toolName}`;
    const toolCallEventId = this.trajectory?.recordToolCall({
      tool,
      args,
      parentEventId,
    });

    // Build MCP tool call
    const toolCall: MCPToolCall = {
      callId: generateUUIDv7(),
      serverName: parsed.serverName,
      toolName: parsed.toolName,
      arguments: args,
      timestamp: nowISO8601(),
    };

    // Map to SintRequest
    const sintRequest: SintRequest = {
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: this.agentId,
      tokenId: this.tokenId,
      resource: toResourceUri(toolCall),
      action: toSintAction(toolCall),
      params: args,
      recentActions: [...this.recentActions],
    };

    // Route through PolicyGateway
    const decision = await this.gateway.intercept(sintRequest);
    this.trajectory?.recordDecision(
      decision.action,
      tool,
      toolCallEventId,
    );

    // Record action for combo detection
    this.recentActions.push(`${parsed.serverName}.${parsed.toolName}`);
    if (this.recentActions.length > 20) {
      this.recentActions.shift();
    }

    // ── Per-server policy enforcement ──
    // Apply maxTier ceiling and requireApproval override from server config.
    const serverConfig = this.downstream.getServerConfig(parsed.serverName);
    const serverPolicy = serverConfig?.policy;

    // If server has requireApproval=true, force escalation for non-T0 actions
    if (serverPolicy?.requireApproval && decision.action === "allow") {
      if (decision.assignedTier !== ApprovalTier.T0_OBSERVE) {
        return this.handleEscalation(
          sintRequest,
          decision,
          parsed,
          args,
          `Server "${parsed.serverName}" requires human approval for all non-observe actions`,
          toolCallEventId,
          startedAtMs,
        );
      }
    }

    // If server has maxTier, deny or escalate if the decision's tier exceeds it
    if (serverPolicy?.maxTier && decision.action === "allow") {
      const maxTier = TIER_FROM_CONFIG[serverPolicy.maxTier];
      if (maxTier !== undefined) {
        const assignedIdx = tierIndex(decision.assignedTier);
        const maxIdx = tierIndex(maxTier);

        if (assignedIdx > maxIdx) {
          // Tool's tier exceeds the server's allowed maximum → deny
          return {
            allowed: false,
            decision,
            denyReason: `Server "${parsed.serverName}" policy restricts to ${serverPolicy.maxTier}. ` +
              `Tool "${parsed.toolName}" requires ${decision.assignedTier}.`,
          };
        }
      }
    }

    switch (decision.action) {
      case "allow": {
        // Forward to downstream
        const result = await this.downstream.callTool(
          parsed.serverName,
          parsed.toolName,
          args,
        );
        this.trajectory?.recordToolResult({
          tool,
          result,
          durationMs: Date.now() - startedAtMs,
          parentEventId: toolCallEventId,
        });
        if (result.isError) {
          this.trajectory?.recordError("Downstream tool call returned isError=true", tool, toolCallEventId);
        }
        return { allowed: true, decision, result };
      }

      case "deny": {
        const reason = decision.denial?.reason ?? "Denied by SINT policy";
        this.trajectory?.recordError(reason, tool, toolCallEventId);
        return { allowed: false, decision, denyReason: reason };
      }

      case "escalate": {
        return this.handleEscalation(
          sintRequest,
          decision,
          parsed,
          args,
          decision.escalation?.reason ?? "Requires human approval",
          toolCallEventId,
          startedAtMs,
        );
      }

      case "transform": {
        // Transform actions — apply transformations and forward
        const result = await this.downstream.callTool(
          parsed.serverName,
          parsed.toolName,
          args,
        );
        this.trajectory?.recordToolResult({
          tool,
          result,
          durationMs: Date.now() - startedAtMs,
          parentEventId: toolCallEventId,
        });
        return { allowed: true, decision, result };
      }

      default: {
        this.trajectory?.recordError(
          `Unknown decision action: ${decision.action}`,
          tool,
          toolCallEventId,
        );
        return {
          allowed: false,
          decision,
          denyReason: `Unknown decision action: ${decision.action}`,
        };
      }
    }
  }

  /**
   * Handle escalation flow — enqueue for approval and wait.
   */
  private async handleEscalation(
    sintRequest: SintRequest,
    decision: PolicyDecision,
    parsed: ParsedNamespace,
    args: Record<string, unknown>,
    reason: string,
    toolCallEventId?: string,
    startedAtMs?: number,
  ): Promise<EnforcementResult> {
    const tool = `${parsed.serverName}.${parsed.toolName}`;
    this.trajectory?.recordEscalation(reason, tool, toolCallEventId);
    const approvalReq = this.approvalQueue.enqueue(sintRequest, decision);

    // Wait for resolution with timeout
    const resolution = await this.waitForResolution(approvalReq.requestId);

    if (resolution === "approved") {
      const result = await this.downstream.callTool(
        parsed.serverName,
        parsed.toolName,
        args,
      );
      this.trajectory?.recordToolResult({
        tool,
        result,
        durationMs: startedAtMs !== undefined ? Date.now() - startedAtMs : 0,
        parentEventId: toolCallEventId,
      });
      return {
        allowed: true,
        decision,
        approvalRequestId: approvalReq.requestId,
        result,
      };
    }

    if (resolution === "timeout") {
      this.trajectory?.markOutcome("timeout");
    } else {
      this.trajectory?.recordError(`Escalation denied: ${reason}`, tool, toolCallEventId);
    }

    return {
      allowed: false,
      decision,
      denyReason: `Escalated: ${reason}. Use sint__approve to approve pending actions.`,
      approvalRequestId: approvalReq.requestId,
    };
  }

  /**
   * Wait for an approval resolution (approve/deny/timeout).
   * Returns immediately if already resolved, otherwise waits.
   */
  private waitForResolution(requestId: string): Promise<"approved" | "denied" | "timeout"> {
    return new Promise((resolve) => {
      // Check if already resolved
      const existing = this.approvalQueue.get(requestId);
      if (!existing) {
        resolve("timeout");
        return;
      }

      // Subscribe to resolution events
      const unsub = this.approvalQueue.on((event) => {
        if (event.type === "resolved" && event.requestId === requestId) {
          unsub();
          if (event.resolution.status === "approved") {
            resolve("approved");
          } else if (event.resolution.status === "denied") {
            resolve("denied");
          } else {
            resolve("timeout");
          }
        }
        if (event.type === "timeout" && event.requestId === requestId) {
          unsub();
          resolve("timeout");
        }
      });
    });
  }
}
