/**
 * SINT Dashboard — Gateway API Client.
 *
 * Communicates with the SINT Gateway Server REST API.
 * In development, Vite proxies /v1/* to localhost:3100.
 *
 * All authenticated requests include the operator's API key
 * via the X-API-Key header (set by `configureAuth()`).
 */

import type {
  HealthResponse,
  PendingApprovalsResponse,
  LedgerResponse,
  ResolveApprovalRequest,
} from "./types.js";

/**
 * Gateway URL base. In development, Vite proxies /v1/* to localhost:3100.
 * In production, set VITE_GATEWAY_URL to the gateway's origin
 * (e.g. "https://gateway.sint.example.com") or leave empty
 * when using nginx proxy on the same domain.
 */
const BASE = import.meta.env.VITE_GATEWAY_URL ?? "";

/** Current auth headers injected by configureAuth(). */
let authHeaders: Record<string, string> = {};

/**
 * Set the API key used for all subsequent requests.
 * Called once on login; cleared on logout.
 */
export function configureAuth(apiKey: string | null): void {
  if (apiKey) {
    authHeaders = { "X-API-Key": apiKey };
  } else {
    authHeaders = {};
  }
}

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders,
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

/** Check gateway health. */
export async function getHealth(): Promise<HealthResponse> {
  return fetchJSON("/v1/health");
}

/** List pending approval requests. */
export async function getPendingApprovals(): Promise<PendingApprovalsResponse> {
  return fetchJSON("/v1/approvals/pending");
}

/** Approve or deny a pending request. */
export async function resolveApproval(
  requestId: string,
  resolution: ResolveApprovalRequest,
): Promise<unknown> {
  return fetchJSON(`/v1/approvals/${requestId}/resolve`, {
    method: "POST",
    body: JSON.stringify(resolution),
  });
}

/** Query the audit ledger. */
export async function getLedger(
  params: { limit?: number; offset?: number; agentId?: string; eventType?: string } = {},
): Promise<LedgerResponse> {
  const searchParams = new URLSearchParams();
  if (params.limit !== undefined) searchParams.set("limit", String(params.limit));
  if (params.offset !== undefined) searchParams.set("offset", String(params.offset));
  if (params.agentId) searchParams.set("agentId", params.agentId);
  if (params.eventType) searchParams.set("eventType", params.eventType);

  const qs = searchParams.toString();
  return fetchJSON(`/v1/ledger${qs ? `?${qs}` : ""}`);
}

/** Generate a new Ed25519 keypair (dev utility). */
export async function generateKeypair(): Promise<{ publicKey: string; privateKey: string }> {
  return fetchJSON("/v1/keypair", { method: "POST" });
}
