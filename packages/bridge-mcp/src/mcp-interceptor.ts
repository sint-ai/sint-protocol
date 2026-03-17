/**
 * SINT Bridge-MCP — Interceptor.
 *
 * The core integration layer that intercepts MCP tool calls,
 * maps them to SINT requests, and routes them through the
 * Policy Gateway for authorization.
 *
 * @module @sint/bridge-mcp/mcp-interceptor
 */

import type { SintRequest } from "@sint/core";
import type { PolicyGateway } from "@sint/gate-policy-gateway";
import { generateUUIDv7, nowISO8601 } from "@sint/gate-capability-tokens";
import type { MCPInterceptResult, MCPToolCall } from "./types.js";
import { toResourceUri, toSintAction, toToolId } from "./mcp-resource-mapper.js";
import { MCPSessionManager } from "./mcp-session.js";

/** Configuration for the MCP interceptor. */
export interface MCPInterceptorConfig {
  /** The SINT Policy Gateway instance. */
  readonly gateway: PolicyGateway;
  /** Maximum recent actions to track per session. */
  readonly maxRecentActions?: number;
}

/**
 * MCP Interceptor — bridges MCP tool calls to the SINT security gate.
 *
 * Flow:
 * 1. Agent makes an MCP tool call
 * 2. Interceptor maps it to a SintRequest
 * 3. PolicyGateway evaluates and returns a decision
 * 4. Interceptor maps the decision to forward/deny/escalate
 * 5. Recent actions are tracked for forbidden combo detection
 *
 * @example
 * ```ts
 * const interceptor = new MCPInterceptor({ gateway });
 *
 * const sessionId = interceptor.createSession({
 *   agentId: agent.publicKey,
 *   tokenId: token.tokenId,
 *   serverName: "filesystem",
 * });
 *
 * const result = interceptor.interceptToolCall(sessionId, {
 *   callId: "call-1",
 *   serverName: "filesystem",
 *   toolName: "writeFile",
 *   arguments: { path: "/tmp/test.txt", content: "hello" },
 *   timestamp: new Date().toISOString(),
 * });
 *
 * if (result.action === "forward") {
 *   // Send to MCP server
 * }
 * ```
 */
export class MCPInterceptor {
  private readonly gateway: PolicyGateway;
  readonly sessions: MCPSessionManager;

  constructor(config: MCPInterceptorConfig) {
    this.gateway = config.gateway;
    this.sessions = new MCPSessionManager();
  }

  /**
   * Create a new session for an agent connecting to an MCP server.
   */
  createSession(options: {
    agentId: string;
    tokenId: string;
    serverName: string;
    maxRecentActions?: number;
  }): string {
    const session = this.sessions.create(options);
    return session.sessionId;
  }

  /**
   * Intercept an MCP tool call through the SINT security gate.
   *
   * Maps the tool call to a SintRequest, routes it through the
   * PolicyGateway, and returns a forward/deny/escalate decision.
   */
  interceptToolCall(
    sessionId: string,
    toolCall: MCPToolCall,
  ): MCPInterceptResult {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        callId: toolCall.callId,
        action: "deny",
        decision: {
          requestId: generateUUIDv7(),
          timestamp: nowISO8601(),
          action: "deny",
          denial: {
            reason: "Session not found",
            policyViolated: "SESSION_NOT_FOUND",
          },
          assignedTier: "T3_commit" as any,
          assignedRisk: "T3_irreversible" as any,
        },
        toolCall,
        denyReason: "Session not found",
      };
    }

    // Map MCP tool call → SINT request
    const sintRequest: SintRequest = {
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: session.agentId,
      tokenId: session.tokenId,
      resource: toResourceUri(toolCall),
      action: toSintAction(toolCall),
      params: toolCall.arguments,
      recentActions: [...session.recentActions],
    };

    // Route through Policy Gateway
    const decision = this.gateway.intercept(sintRequest);

    // Record the action for future combo detection
    const toolId = toToolId(toolCall.serverName, toolCall.toolName);
    this.sessions.recordAction(sessionId, toolId);

    // Map decision → intercept result
    const result: MCPInterceptResult = {
      callId: toolCall.callId,
      action: decision.action === "allow" ? "forward" : decision.action === "deny" ? "deny" : "escalate",
      decision,
      toolCall,
    };

    if (decision.action === "deny" && decision.denial) {
      return { ...result, denyReason: decision.denial.reason };
    }

    if (decision.action === "escalate" && decision.escalation) {
      return { ...result, requiredTier: decision.escalation.requiredTier };
    }

    return result;
  }

  /**
   * Remove a session (agent disconnected).
   */
  removeSession(sessionId: string): boolean {
    return this.sessions.remove(sessionId);
  }
}
