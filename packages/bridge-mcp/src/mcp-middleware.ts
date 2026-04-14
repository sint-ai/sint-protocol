/**
 * SINT Bridge MCP — Drop-in Middleware.
 *
 * Wraps any MCP server's tool handler to enforce SINT policy
 * on every tool call. Auto-creates sessions per agent.
 *
 * @module @sint/bridge-mcp/mcp-middleware
 */

import type { PolicyGateway } from "@pshkv/gate-policy-gateway";
import { MCPInterceptor } from "./mcp-interceptor.js";
import type { MCPToolCall, MCPInterceptResult } from "./types.js";

export interface SintMiddlewareConfig {
  /** PolicyGateway instance for local policy evaluation. */
  gateway: PolicyGateway;
  /** Default server name for resource URI mapping. */
  serverName: string;
  /** Maximum recent actions tracked per session (default: 20). */
  maxRecentActions?: number;
}

export interface ToolCallContext {
  /** Agent's Ed25519 public key. */
  agentId: string;
  /** Capability token ID authorizing this agent. */
  tokenId: string;
  /** The tool call to intercept. */
  toolCall: MCPToolCall;
}

export type ToolHandler<T = unknown> = (toolCall: MCPToolCall) => Promise<T>;

/**
 * Create a SINT middleware that wraps MCP tool handlers.
 *
 * @example
 * ```ts
 * const sint = createSintMiddleware({ gateway, serverName: "my-mcp" });
 *
 * // Wrap your tool handler
 * const protectedHandler = sint.protect(originalHandler);
 *
 * // Or intercept manually
 * const result = sint.intercept(context);
 * if (result.action === "forward") {
 *   await originalHandler(context.toolCall);
 * }
 * ```
 */
export function createSintMiddleware(config: SintMiddlewareConfig) {
  const interceptor = new MCPInterceptor({ gateway: config.gateway });
  const sessionMap = new Map<string, string>(); // agentId → sessionId

  function ensureSession(agentId: string, tokenId: string): string {
    const existing = sessionMap.get(agentId);
    if (existing) return existing;

    const sessionId = interceptor.createSession({
      agentId,
      tokenId,
      serverName: config.serverName,
      maxRecentActions: config.maxRecentActions,
    });
    sessionMap.set(agentId, sessionId);
    return sessionId;
  }

  return {
    /** Get the underlying MCPInterceptor. */
    get interceptor() {
      return interceptor;
    },

    /**
     * Intercept a tool call and return the policy decision.
     * Auto-creates a session for the agent if needed.
     */
    async intercept(context: ToolCallContext): Promise<MCPInterceptResult> {
      const sessionId = ensureSession(context.agentId, context.tokenId);
      return interceptor.interceptToolCall(sessionId, context.toolCall);
    },

    /**
     * Wrap a tool handler with SINT policy enforcement.
     * Returns a new handler that checks policy before execution.
     *
     * Denied calls throw an error with the deny reason.
     * Escalated calls throw an error (caller must handle approval).
     */
    protect<T>(
      handler: ToolHandler<T>,
      agentId: string,
      tokenId: string,
    ): ToolHandler<T> {
      return async (toolCall: MCPToolCall): Promise<T> => {
        const result = await this.intercept({ agentId, tokenId, toolCall });

        if (result.action === "deny") {
          throw new Error(`SINT: Tool call denied — ${result.denyReason ?? "policy violation"}`);
        }

        if (result.action === "escalate") {
          throw new Error(
            `SINT: Tool call requires approval (tier: ${result.requiredTier ?? "unknown"})`,
          );
        }

        return handler(toolCall);
      };
    },

    /** Remove a session for an agent. */
    removeSession(agentId: string): boolean {
      const sessionId = sessionMap.get(agentId);
      if (!sessionId) return false;
      sessionMap.delete(agentId);
      return interceptor.removeSession(sessionId);
    },

    /** Get active session count. */
    get sessionCount(): number {
      return sessionMap.size;
    },
  };
}
