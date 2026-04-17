import type {
  ApprovalTier,
  ISO8601,
  PolicyDecision,
  SintExecutionContext,
  SintRequest,
  UUIDv7,
} from "@pshkv/core";

/**
 * Minimal gateway contract used by the adapter.
 * Keeps the package easy to test while remaining compatible with PolicyGateway.
 */
export interface SINTGatewayLike {
  intercept(request: SintRequest): Promise<PolicyDecision>;
}

/**
 * Tool or method call entering the PDP interceptor.
 * The adapter accepts explicit resource/action values when the host already knows them,
 * and falls back to an MCP-shaped server/tool naming scheme otherwise.
 */
export interface PDPInterceptorCall {
  readonly serverName?: string;
  readonly toolName?: string;
  readonly method?: string;
  readonly resource?: string;
  readonly action?: string;
  readonly params?: Record<string, unknown>;
  readonly annotations?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Execution metadata carried by the host runtime alongside the MCP call.
 */
export interface PDPInterceptorContext {
  readonly tokenId?: UUIDv7;
  readonly requestId?: UUIDv7;
  readonly timestamp?: ISO8601;
  readonly physicalContext?: SintRequest["physicalContext"];
  readonly executionContext?: SintExecutionContext;
  readonly recentActions?: readonly string[];
}

/**
 * SEP-1763-style request shape adapted into a SINT gateway call.
 */
export interface PDPInterceptorRequest {
  readonly caller_identity: string;
  readonly mcp_call: PDPInterceptorCall;
  readonly context?: PDPInterceptorContext;
}

/**
 * Normalized decision surface for MCP hosts.
 * `verdict` collapses `transform` into `allow` so hosts can decide whether to proceed,
 * while still preserving the raw SINT PolicyDecision for richer handling.
 */
export interface PDPDecision {
  readonly verdict: "allow" | "deny" | "escalate";
  readonly tier: ApprovalTier;
  readonly reason?: string;
  readonly decision: PolicyDecision;
}

export interface SINTPDPInterceptorConfig {
  readonly gateway: SINTGatewayLike;
  readonly defaultTokenId?: UUIDv7;
  readonly defaultAction?: string;
  readonly failClosed?: boolean;
  readonly now?: () => ISO8601;
  readonly createRequestId?: () => UUIDv7;
  readonly resolveResource?: (call: PDPInterceptorCall) => string;
  readonly resolveAction?: (call: PDPInterceptorCall) => string;
}
