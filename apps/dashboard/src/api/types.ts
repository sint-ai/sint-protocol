/**
 * SINT Dashboard — API Types.
 *
 * Mirrors the Gateway Server response shapes.
 */

/** Health check response. */
export interface HealthResponse {
  status: string;
  version: string;
  protocol: string;
  tokens: number;
  ledgerEvents: number;
  revokedTokens: number;
}

/** A pending approval request. */
export interface ApprovalRequest {
  requestId: string;
  reason: string;
  requiredTier: string;
  resource: string;
  action: string;
  agentId: string;
  fallbackAction?: string;
  createdAt: string;
  expiresAt: string;
}

/** Pending approvals list response. */
export interface PendingApprovalsResponse {
  count: number;
  requests: ApprovalRequest[];
}

/** A single ledger event. */
export interface LedgerEvent {
  eventId: string;
  eventType: string;
  agentId: string;
  tokenId?: string;
  timestamp: string;
  sequenceNumber: string;
  payload: Record<string, unknown>;
}

/** Ledger query response. */
export interface LedgerResponse {
  events: LedgerEvent[];
  total: number;
  chainIntegrity: boolean;
}

/** Approval resolution request body. */
export interface ResolveApprovalRequest {
  status: "approved" | "denied";
  by: string;
  reason?: string;
}

/** SSE approval event. */
export interface ApprovalSSEEvent {
  type: "queued" | "resolved" | "timeout";
  request?: ApprovalRequest;
  requestId?: string;
  resolution?: {
    status: "approved" | "denied" | "timeout";
    by?: string;
    reason?: string;
  };
}
