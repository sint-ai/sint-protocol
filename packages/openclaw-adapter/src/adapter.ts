/**
 * OpenClawAdapter — SINT governance layer for OpenClaw.
 *
 * Wraps the OpenClaw Gateway and injects SINT Protocol governance
 * (capability tokens, policy gateway, evidence ledger) into every
 * tool call, MCP server call, and node action.
 *
 * This is the central choke-point: nothing goes through OpenClaw
 * without passing SINT's policy check first.
 *
 * @example
 * ```typescript
 * import { OpenClawAdapter } from "@pshkv/openclaw-adapter";
 *
 * const adapter = new OpenClawAdapter({
 *   gatewayUrl: "http://localhost:4100",
 *   agentId: "my-agent-pubkey",
 *   crossSystemPolicies: DEFAULT_PHYSICAL_POLICIES,
 * });
 *
 * // Intercept a tool call
 * const result = await adapter.governToolCall({
 *   tool: "exec",
 *   params: { command: "rm -rf /tmp/data" },
 *   elevated: true,
 * });
 * // result.allowed === false, result.tier === "T3", result.outcome === "escalate"
 * ```
 */

import type {
  OpenClawToolCall,
  OpenClawMCPCall,
  OpenClawNodeAction,
  GovernanceResult,
  OpenClawAdapterConfig,
  SintTier,
} from "./types.js";
import {
  classifyToolCall,
  classifyMCPCall,
  classifyNodeAction,
} from "./tier-classifier.js";
import {
  SystemStateTracker,
  evaluateCrossSystemPolicies,
} from "./cross-system.js";

export class OpenClawAdapter {
  private readonly config: OpenClawAdapterConfig;
  private readonly stateTracker: SystemStateTracker;
  private readonly interceptLog: Array<{
    timestamp: string;
    type: "tool" | "mcp" | "node";
    resource: string;
    action: string;
    tier: SintTier;
    outcome: string;
  }> = [];

  constructor(config: OpenClawAdapterConfig) {
    this.config = {
      blockOnDeny: true,
      waitForApproval: false,
      approvalTimeoutMs: 30_000,
      timeoutMs: 5_000,
      crossSystemPolicies: [],
      ...config,
    };
    this.stateTracker = new SystemStateTracker();
  }

  /**
   * Govern an OpenClaw tool call.
   *
   * Classifies the tool into a SINT tier, checks cross-system policies,
   * then sends an intercept request to the SINT Policy Gateway.
   */
  async governToolCall(call: OpenClawToolCall): Promise<GovernanceResult> {
    const tier = this.config.tierClassifier
      ? this.config.tierClassifier(call)
      : classifyToolCall(call);

    const resource = `openclaw.tool:${call.tool}`;
    const action =
      typeof call.params?.action === "string"
        ? call.params.action
        : "execute";

    // Cross-system policy check (local, pre-gateway)
    const crossDenial = evaluateCrossSystemPolicies(
      resource,
      action,
      this.config.crossSystemPolicies ?? [],
      this.stateTracker,
      tier,
    );
    if (crossDenial) {
      this.log("tool", resource, action, tier, crossDenial.outcome);
      return crossDenial;
    }

    // T0 is always allowed (observe-only)
    if (tier === "T0") {
      const result: GovernanceResult = {
        allowed: true,
        tier: "T0",
        outcome: "approve",
        reason: "T0 observe-only — auto-approved",
      };
      this.log("tool", resource, action, tier, "approve");
      return result;
    }

    // T1+ goes through the Policy Gateway
    return this.interceptViaGateway(
      "tool",
      resource,
      action,
      tier,
      {
        tool: call.tool,
        params: call.params,
        sessionKey: call.sessionKey,
        agentId: call.agentId,
        elevated: call.elevated,
      },
    );
  }

  /**
   * Govern an MCP server tool call.
   */
  async governMCPCall(call: OpenClawMCPCall): Promise<GovernanceResult> {
    const tier = this.config.tierClassifier
      ? this.config.tierClassifier(call)
      : classifyMCPCall(call);

    const resource = `openclaw.mcp:${call.server}/${call.tool}`;
    const action = "execute";

    const crossDenial = evaluateCrossSystemPolicies(
      resource,
      action,
      this.config.crossSystemPolicies ?? [],
      this.stateTracker,
      tier,
    );
    if (crossDenial) {
      this.log("mcp", resource, action, tier, crossDenial.outcome);
      return crossDenial;
    }

    if (tier === "T0") {
      this.log("mcp", resource, action, tier, "approve");
      return {
        allowed: true,
        tier: "T0",
        outcome: "approve",
        reason: "T0 observe-only — auto-approved",
      };
    }

    return this.interceptViaGateway("mcp", resource, action, tier, {
      server: call.server,
      tool: call.tool,
      args: call.args,
      sessionKey: call.sessionKey,
    });
  }

  /**
   * Govern a node action (physical device control).
   */
  async governNodeAction(
    action: OpenClawNodeAction,
  ): Promise<GovernanceResult> {
    const tier = this.config.tierClassifier
      ? this.config.tierClassifier(action)
      : classifyNodeAction(action);

    const resource = `openclaw.node:${action.nodeId}/${action.action}`;
    const actionStr = action.action;

    const crossDenial = evaluateCrossSystemPolicies(
      resource,
      actionStr,
      this.config.crossSystemPolicies ?? [],
      this.stateTracker,
      tier,
    );
    if (crossDenial) {
      this.log("node", resource, actionStr, tier, crossDenial.outcome);
      return crossDenial;
    }

    if (tier === "T0") {
      this.log("node", resource, actionStr, tier, "approve");
      return {
        allowed: true,
        tier: "T0",
        outcome: "approve",
        reason: "T0 observe-only — auto-approved",
      };
    }

    return this.interceptViaGateway("node", resource, actionStr, tier, {
      nodeId: action.nodeId,
      action: action.action,
      params: action.params,
    });
  }

  /**
   * Get the system state tracker for cross-system policy management.
   */
  getStateTracker(): SystemStateTracker {
    return this.stateTracker;
  }

  /**
   * Get the full intercept audit log.
   */
  getInterceptLog(): ReadonlyArray<typeof this.interceptLog[number]> {
    return this.interceptLog;
  }

  /**
   * Clear the intercept log.
   */
  clearLog(): void {
    this.interceptLog.length = 0;
  }

  // --- Private ---

  private async interceptViaGateway(
    type: "tool" | "mcp" | "node",
    resource: string,
    action: string,
    tier: SintTier,
    context: Record<string, unknown>,
  ): Promise<GovernanceResult> {
    const url = `${this.config.gatewayUrl}/v1/intercept`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.config.apiKey) {
      headers["X-API-Key"] = this.config.apiKey;
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? 5000,
    );

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          requestId: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          timestamp: new Date().toISOString(),
          agentId: this.config.agentId,
          tokenId: this.config.token ?? "",
          resource,
          action,
          params: context,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        this.log(type, resource, action, tier, "deny");
        return {
          allowed: false,
          tier,
          outcome: "deny",
          reason: `Gateway returned ${res.status}: ${text}`,
        };
      }

      const data = (await res.json()) as Record<string, unknown>;
      const outcome =
        (data.action as string) === "allow"
          ? "approve"
          : (data.action as string) === "escalate"
            ? "escalate"
            : "deny";

      const result: GovernanceResult = {
        allowed: outcome === "approve",
        tier: (data.assignedTier as SintTier) ?? tier,
        outcome: outcome as "approve" | "deny" | "escalate",
        reason: data.reason as string | undefined,
        approvalId: data.approvalRequestId as string | undefined,
        evidenceId: data.evidenceId as string | undefined,
        constraints: data.constraints as Record<string, unknown> | undefined,
      };

      this.log(type, resource, action, result.tier, result.outcome);
      return result;
    } catch (err) {
      const isTimeout = (err as Error)?.name === "AbortError";
      this.log(type, resource, action, tier, "deny");
      return {
        allowed: false,
        tier,
        outcome: "deny",
        reason: isTimeout
          ? `Gateway request timed out (${this.config.timeoutMs}ms)`
          : `Gateway request failed: ${(err as Error).message}`,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private log(
    type: "tool" | "mcp" | "node",
    resource: string,
    action: string,
    tier: SintTier,
    outcome: string,
  ): void {
    this.interceptLog.push({
      timestamp: new Date().toISOString(),
      type,
      resource,
      action,
      tier,
      outcome,
    });
  }
}
