/**
 * SINT Client SDK — Gateway Client.
 *
 * Typed HTTP client for the SINT Gateway Server API.
 *
 * @module @sint/client/sint-client
 */

import type { SintCapabilityTokenRequest } from "@sint-ai/core";

export interface SintClientOptions {
  /** Gateway base URL (e.g. "http://localhost:3100"). */
  baseUrl: string;
  /** Admin API key for privileged endpoints. */
  apiKey?: string;
  /** Custom fetch implementation (for testing). */
  fetch?: typeof globalThis.fetch;
}

export interface InterceptRequest {
  requestId: string;
  timestamp: string;
  agentId: string;
  tokenId: string;
  resource: string;
  action: string;
  params?: Record<string, unknown>;
}

export interface InterceptResult {
  action: "allow" | "deny" | "escalate";
  assignedTier?: string;
  approvalRequestId?: string;
  [key: string]: unknown;
}

export interface TokenResult {
  tokenId: string;
  [key: string]: unknown;
}

export interface LedgerResult {
  events: readonly Record<string, unknown>[];
  chainIntegrity: boolean;
}

/** SSE approval event received from the gateway. */
export interface ApprovalSSEEvent {
  type: "queued" | "resolved" | "timeout";
  request?: Record<string, unknown>;
  requestId?: string;
  resolution?: {
    status: "approved" | "denied" | "timeout";
    by?: string;
    reason?: string;
  };
}

/** Handle returned by subscribeToApprovals for lifecycle control. */
export interface ApprovalSubscription {
  /** Stop listening and close the connection. */
  unsubscribe: () => void;
}

export class SintClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly _fetch: typeof globalThis.fetch;

  constructor(options: SintClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.apiKey = options.apiKey;
    this._fetch = options.fetch ?? globalThis.fetch;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (this.apiKey) h["X-API-Key"] = this.apiKey;
    return h;
  }

  /** Health check. */
  async health(): Promise<{ status: string; protocol: string }> {
    const res = await this._fetch(`${this.baseUrl}/v1/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
    return res.json() as any;
  }

  /** Evaluate a single request through the Policy Gateway. */
  async intercept(request: InterceptRequest): Promise<InterceptResult> {
    const res = await this._fetch(`${this.baseUrl}/v1/intercept`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(request),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Intercept failed (${res.status}): ${JSON.stringify(body)}`);
    }
    return res.json() as any;
  }

  /** Batch evaluate requests. Returns 207 multi-status. */
  async interceptBatch(requests: InterceptRequest[]): Promise<any[]> {
    const res = await this._fetch(`${this.baseUrl}/v1/intercept/batch`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(requests),
    });
    if (!res.ok && res.status !== 207) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Batch intercept failed (${res.status}): ${JSON.stringify(body)}`);
    }
    return res.json() as any;
  }

  /** Issue a new capability token. */
  async issueToken(
    request: SintCapabilityTokenRequest,
    privateKey: string,
  ): Promise<TokenResult> {
    const res = await this._fetch(`${this.baseUrl}/v1/tokens`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ request, privateKey }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Token issuance failed (${res.status}): ${JSON.stringify(body)}`);
    }
    return res.json() as any;
  }

  /** Revoke a capability token. */
  async revokeToken(
    tokenId: string,
    reason: string,
    revokedBy: string,
  ): Promise<{ status: string }> {
    const res = await this._fetch(`${this.baseUrl}/v1/tokens/revoke`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ tokenId, reason, revokedBy }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Revocation failed (${res.status}): ${JSON.stringify(body)}`);
    }
    return res.json() as any;
  }

  /** Query the Evidence Ledger. */
  async queryLedger(filters?: Record<string, unknown>): Promise<LedgerResult> {
    const params = filters
      ? "?" + new URLSearchParams(
          Object.entries(filters).map(([k, v]) => [k, String(v)] as [string, string]),
        ).toString()
      : "";
    const res = await this._fetch(`${this.baseUrl}/v1/ledger${params}`, {
      headers: this.headers(),
    });
    if (!res.ok) {
      throw new Error(`Ledger query failed: ${res.status}`);
    }
    return res.json() as any;
  }

  /** Generate an Ed25519 keypair (dev utility). */
  async generateKeypair(): Promise<{ publicKey: string; privateKey: string }> {
    const res = await this._fetch(`${this.baseUrl}/v1/keypair`, {
      method: "POST",
    });
    if (!res.ok) throw new Error(`Keypair generation failed: ${res.status}`);
    return res.json() as any;
  }

  /** List pending approval requests. */
  async pendingApprovals(): Promise<{ count: number; requests: any[] }> {
    const res = await this._fetch(`${this.baseUrl}/v1/approvals/pending`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Pending approvals failed: ${res.status}`);
    return res.json() as any;
  }

  /** Resolve (approve/deny) an approval request. */
  async resolveApproval(
    requestId: string,
    status: "approved" | "denied",
    by: string,
    reason?: string,
  ): Promise<any> {
    const res = await this._fetch(
      `${this.baseUrl}/v1/approvals/${requestId}/resolve`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ status, by, reason }),
      },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Approval resolution failed (${res.status}): ${JSON.stringify(body)}`);
    }
    return res.json() as any;
  }

  /**
   * Delegate (attenuate) an existing capability token.
   *
   * Creates a new token with equal or narrower permissions than the parent.
   * The delegation chain is automatically extended.
   *
   * @param parentTokenId - Token ID of the parent capability to delegate from.
   * @param request - Delegation params: { newSubject, restrictActions?, tightenConstraints?, expiresAt? }
   * @param privateKey - Private key of the parent token's subject (delegator).
   * @returns The newly issued delegated token.
   */
  async delegateToken(
    parentTokenId: string,
    request: {
      newSubject: string;
      restrictActions?: string[];
      tightenConstraints?: Record<string, unknown>;
      expiresAt?: string;
    },
    privateKey: string,
  ): Promise<TokenResult> {
    const res = await this._fetch(`${this.baseUrl}/v1/tokens/delegate`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ parentTokenId, request, privateKey }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(`Token delegation failed (${res.status}): ${JSON.stringify(body)}`);
    }
    return res.json() as any;
  }

  /**
   * Subscribe to real-time approval events via SSE.
   *
   * Connects to the gateway's SSE endpoint and invokes the callback
   * for every approval event (queued, resolved, timeout).
   *
   * @param onEvent - Callback invoked for each SSE event.
   * @param onError - Optional error callback.
   * @returns Subscription handle with `unsubscribe()` method.
   *
   * @example
   * ```ts
   * const sub = client.subscribeToApprovals((event) => {
   *   if (event.type === "queued") {
   *     console.log("New approval needed:", event.request);
   *   }
   * });
   * // Later: sub.unsubscribe();
   * ```
   */
  subscribeToApprovals(
    onEvent: (event: ApprovalSSEEvent) => void,
    onError?: (error: Event | Error) => void,
  ): ApprovalSubscription {
    const url = `${this.baseUrl}/v1/approvals/events`;

    // Use native EventSource for SSE (browser and Node 18+ with polyfill).
    // The EventSource API doesn't support custom headers, so API key auth
    // relies on cookie/session-based auth or is handled at the transport level.
    const es = new EventSource(url);

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ApprovalSSEEvent;
        onEvent(data);
      } catch {
        // Ignore malformed events
      }
    };

    es.onerror = (event) => {
      if (onError) {
        onError(event as Event);
      }
    };

    return {
      unsubscribe: () => {
        es.close();
      },
    };
  }
}
