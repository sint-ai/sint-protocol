/**
 * SINT Bridge-MCP — Types for MCP tool call interception.
 *
 * These types represent the MCP protocol's tool call lifecycle
 * as it flows through the SINT security gate.
 *
 * @module @sint/bridge-mcp/types
 */

import type {
  ApprovalTier,
  DurationMs,
  Ed25519PublicKey,
  ISO8601,
  PolicyDecision,
  UUIDv7,
} from "@sint/core";
import type { RevocationStore } from "@sint/gate-capability-tokens";
import type { PolicyGateway } from "@sint/gate-policy-gateway";

/**
 * An MCP tool call entering the SINT bridge for interception.
 */
export interface MCPToolCall {
  /** Unique call ID (typically from the MCP protocol). */
  readonly callId: string;
  /** MCP server name (e.g. "filesystem", "database"). */
  readonly serverName: string;
  /** Tool name (e.g. "readFile", "writeFile", "exec"). */
  readonly toolName: string;
  /** Tool call arguments. */
  readonly arguments: Record<string, unknown>;
  /** Timestamp of the call. */
  readonly timestamp: ISO8601;
}

/**
 * Result of SINT intercepting an MCP tool call.
 */
export interface MCPInterceptResult {
  /** The original call ID. */
  readonly callId: string;
  /** Whether the call is allowed to proceed. */
  readonly action: "forward" | "deny" | "escalate";
  /** The full policy decision. */
  readonly decision: PolicyDecision;
  /** The original tool call (for forwarding). */
  readonly toolCall: MCPToolCall;
  /** If denied, the reason. */
  readonly denyReason?: string;
  /** If escalated, which tier is required. */
  readonly requiredTier?: ApprovalTier;
}

/**
 * Result forwarded back after tool execution.
 */
export interface MCPToolResult {
  /** The call ID this result corresponds to. */
  readonly callId: string;
  /** Whether the tool call succeeded. */
  readonly success: boolean;
  /** The tool's output. */
  readonly output: unknown;
  /** Execution duration in milliseconds. */
  readonly durationMs: DurationMs;
}

/**
 * Risk classification hints for MCP tool operations.
 */
export interface MCPRiskHint {
  /** Suggested approval tier for this operation. */
  readonly suggestedTier: ApprovalTier;
  /** SINT resource action (e.g. "call", "subscribe"). */
  readonly action: string;
  /** Whether this operation has physical consequences. */
  readonly hasPhysicalEffect: boolean;
  /** Whether human presence should escalate the tier. */
  readonly escalateOnHumanPresence: boolean;
}

/**
 * Configuration for the MCP interceptor.
 */
export interface MCPInterceptorConfig {
  /** The policy gateway instance. */
  readonly gateway: PolicyGateway;
  /** Function to resolve a capability token by ID. */
  readonly resolveToken: (tokenId: string) => unknown;
  /** Optional revocation store. */
  readonly revocationStore?: RevocationStore;
  /** Default token ID to use if not specified per-session. */
  readonly defaultTokenId?: UUIDv7;
  /** Emit ledger events. */
  readonly emitLedgerEvent?: (event: unknown) => void;
}

/**
 * Per-agent session tracking for MCP connections.
 */
export interface MCPSession {
  /** Session ID. */
  readonly sessionId: string;
  /** Agent's public key. */
  readonly agentId: Ed25519PublicKey;
  /** Capability token bound to this session. */
  readonly tokenId: UUIDv7;
  /** MCP server this session connects to. */
  readonly serverName: string;
  /** When the session was created. */
  readonly createdAt: ISO8601;
  /** Recent tool calls for forbidden combo detection. */
  readonly recentActions: string[];
  /** Maximum number of recent actions to track. */
  readonly maxRecentActions: number;
}
