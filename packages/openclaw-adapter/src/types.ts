/**
 * Type definitions for the SINT ↔ OpenClaw adapter.
 */

/** OpenClaw tool call context — what OpenClaw provides to the adapter. */
export interface OpenClawToolCall {
  /** Tool identifier (e.g., "browser.navigate", "exec", "read", "write"). */
  tool: string;
  /** Tool parameters as key-value pairs. */
  params: Record<string, unknown>;
  /** Session key the tool is called from. */
  sessionKey?: string;
  /** Agent ID if known. */
  agentId?: string;
  /** Whether the tool call requires elevated permissions. */
  elevated?: boolean;
}

/** OpenClaw MCP server call context. */
export interface OpenClawMCPCall {
  /** MCP server identifier. */
  server: string;
  /** MCP tool name. */
  tool: string;
  /** Tool arguments. */
  args: Record<string, unknown>;
  /** Session context. */
  sessionKey?: string;
}

/** OpenClaw node action context (camera, screen, system.run, etc.). */
export interface OpenClawNodeAction {
  /** Node identifier. */
  nodeId: string;
  /** Action type (e.g., "camera_snap", "screen_record", "system.run"). */
  action: string;
  /** Action parameters. */
  params: Record<string, unknown>;
}

/** SINT tier classification for OpenClaw actions. */
export type SintTier = "T0" | "T1" | "T2" | "T3";

/** Result of SINT governance check. */
export interface GovernanceResult {
  /** Whether the action is allowed. */
  allowed: boolean;
  /** SINT tier assigned. */
  tier: SintTier;
  /** Outcome from the policy gateway. */
  outcome: "approve" | "deny" | "escalate";
  /** Human-readable reason. */
  reason?: string;
  /** Approval request ID (if escalated). */
  approvalId?: string;
  /** Evidence ledger entry ID. */
  evidenceId?: string;
  /** Constraints applied. */
  constraints?: Record<string, unknown>;
}

/** Adapter configuration. */
export interface OpenClawAdapterConfig {
  /** SINT Gateway URL (e.g., "http://localhost:4100"). */
  gatewayUrl: string;
  /** Agent identifier (Ed25519 public key hex). */
  agentId: string;
  /** Capability token. */
  token?: string;
  /** Admin API key. */
  apiKey?: string;
  /** Custom tier classifier override. */
  tierClassifier?: (call: OpenClawToolCall | OpenClawMCPCall | OpenClawNodeAction) => SintTier;
  /** Whether to block on deny. Default: true. */
  blockOnDeny?: boolean;
  /** Whether to wait for approval on escalate. Default: false (non-blocking). */
  waitForApproval?: boolean;
  /** Approval timeout in milliseconds. Default: 30000. */
  approvalTimeoutMs?: number;
  /** Request timeout in milliseconds. Default: 5000. */
  timeoutMs?: number;
  /** Cross-system policy rules. */
  crossSystemPolicies?: CrossSystemPolicy[];
}

/** Cross-system policy: deny an action when another condition is active. */
export interface CrossSystemPolicy {
  /** Human-readable name. */
  name: string;
  /** Condition: deny when this resource is active. */
  whenActive: string;
  /** Actions to deny while the condition is active. */
  denyActions: string[];
  /** Denial reason message. */
  reason: string;
}
