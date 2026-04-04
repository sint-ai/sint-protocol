/**
 * SINT Protocol TypeScript SDK v0.2
 *
 * Zero-dependency HTTP client for the SINT Protocol gateway.
 * Works in Node.js (18+) and browser environments via fetch.
 *
 * @example
 * const sint = new SintClient({ baseUrl: "http://localhost:3000" });
 * const decision = await sint.intercept({
 *   agentId: "agent-public-key-hex",
 *   tokenId: "uuid-v7",
 *   resource: "ros2:///cmd_vel",
 *   action: "publish",
 *   params: { linear: { x: 0.5 } },
 * });
 *
 * @module @sint/sdk
 */

// ---------------------------------------------------------------------------
// Configuration & Request types
// ---------------------------------------------------------------------------

export interface SintClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeoutMs?: number;
}

export interface SintInterceptRequest {
  requestId?: string;
  timestamp?: string;
  agentId: string;
  tokenId: string;
  resource: string;
  action: string;
  params?: Record<string, unknown>;
  physicalContext?: {
    currentVelocityMps?: number;
    currentForceNewtons?: number;
    humanDetected?: boolean;
    currentPosition?: { x: number; y: number; z?: number };
  };
  recentActions?: string[];
  executionContext?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface SintDecision {
  action: "allow" | "deny" | "escalate" | "transform";
  assignedTier: string;
  assignedRisk: string;
  denial?: { reason: string; policyViolated: string; suggestedAlternative?: string };
  escalation?: {
    requiredTier: string;
    reason: string;
    timeoutMs: number;
    fallbackAction: string;
  };
  approvalRequestId?: string;
}

export interface SintPendingApproval {
  requestId: string;
  reason: string;
  requiredTier: string;
  resource: string;
  action: string;
  agentId: string;
  fallbackAction: "deny" | "safe-stop";
  approvalQuorum?: { required: number; authorized: string[] };
  approvalCount: number;
  createdAt: string;
  expiresAt: string;
}

export interface SintDiscovery {
  name: string;
  version: string;
  boundary: string;
  identityMethods: string[];
  attestationModes: string[];
  deploymentProfiles: Array<Record<string, unknown>>;
  supportedBridges: Array<Record<string, unknown>>;
  schemaCatalog: Array<{ name: string; path: string }>;
  openapi: string;
}

export interface SintSchemaIndex {
  total: number;
  schemas: Array<{ name: string; path: string }>;
}

export interface SintBatchResult {
  status: number;
  decision?: SintDecision;
  approvalRequestId?: string;
  error?: string;
  details?: unknown;
}

export type SintApprovalResolutionResponse =
  | {
      requestId: string;
      resolution: {
        status: "approved" | "denied";
        by: string;
        reason?: string;
      };
    }
  | {
      requestId: string;
      status: "pending";
      requiredApprovals: number;
      approvalCount: number;
    };

export interface SintHealth {
  status: string;
  version: string;
  protocol: string;
  tokens: number;
  ledgerEvents: number;
  revokedTokens: number;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

/**
 * SintError is thrown when the gateway returns a 4xx or 5xx response.
 */
export class SintError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SintError";
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build headers for every request. */
function buildHeaders(apiKey: string): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }
  return headers;
}

function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(out);
    return out;
  }
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.floor(Math.random() * 256);
  }
  return out;
}

function generateUuidV7(): string {
  const bytes = randomBytes(16);
  const ts = BigInt(Date.now());

  bytes[0] = Number((ts >> 40n) & 0xffn);
  bytes[1] = Number((ts >> 32n) & 0xffn);
  bytes[2] = Number((ts >> 24n) & 0xffn);
  bytes[3] = Number((ts >> 16n) & 0xffn);
  bytes[4] = Number((ts >> 8n) & 0xffn);
  bytes[5] = Number(ts & 0xffn);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function nowIsoUtc(): string {
  return new Date().toISOString();
}

/** Parse an error body from a failed response and throw SintError. */
async function throwSintError(res: Response): Promise<never> {
  let code = "GATEWAY_ERROR";
  let message = `HTTP ${res.status}`;
  try {
    const body = await res.json() as Record<string, unknown>;
    if (typeof body["code"] === "string") code = body["code"];
    if (typeof body["message"] === "string") message = body["message"];
    else if (typeof body["error"] === "string") message = body["error"];
  } catch {
    // body is not JSON — keep defaults
  }
  throw new SintError(res.status, code, message);
}

// ---------------------------------------------------------------------------
// Main client
// ---------------------------------------------------------------------------

export class SintClient {
  private readonly config: Required<SintClientConfig>;

  constructor(config: SintClientConfig) {
    this.config = {
      baseUrl: config.baseUrl.replace(/\/$/, ""),
      apiKey: config.apiKey ?? "",
      timeoutMs: config.timeoutMs ?? 10_000,
    };
  }

  // -------------------------------------------------------------------------
  // Low-level fetch wrapper
  // -------------------------------------------------------------------------

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    let res: Response;
    try {
      res = await fetch(`${this.config.baseUrl}${path}`, {
        method,
        headers: buildHeaders(this.config.apiKey),
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      await throwSintError(res);
    }

    // 204 No Content — return empty object cast to T
    if (res.status === 204) {
      return undefined as unknown as T;
    }

    return res.json() as Promise<T>;
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Fetch the SINT well-known discovery document. */
  async discovery(): Promise<SintDiscovery> {
    return this.request<SintDiscovery>("GET", "/.well-known/sint.json");
  }

  /** Health check — returns gateway status and uptime. */
  async health(): Promise<SintHealth> {
    return this.request<SintHealth>("GET", "/v1/health");
  }

  /**
   * Intercept a single agent action.
   *
   * `requestId` (UUIDv7) and `timestamp` are auto-filled when omitted.
   */
  async intercept(req: SintInterceptRequest): Promise<SintDecision> {
    const payload = {
      requestId: req.requestId ?? generateUuidV7(),
      timestamp: req.timestamp ?? nowIsoUtc(),
      ...req,
    };
    return this.request<SintDecision>("POST", "/v1/intercept", payload);
  }

  /** Intercept multiple actions in a single round-trip. */
  async interceptBatch(
    requests: SintInterceptRequest[],
  ): Promise<SintBatchResult[]> {
    const payload = requests.map((req) => ({
      requestId: req.requestId ?? generateUuidV7(),
      timestamp: req.timestamp ?? nowIsoUtc(),
      ...req,
    }));
    return this.request<SintBatchResult[]>("POST", "/v1/intercept/batch", payload);
  }

  /** List approvals currently waiting for human resolution. */
  async pendingApprovals(): Promise<{ count: number; requests: SintPendingApproval[] }> {
    return this.request<{ count: number; requests: SintPendingApproval[] }>(
      "GET",
      "/v1/approvals/pending",
    );
  }

  /**
   * Resolve a pending approval (approve or deny).
   *
   * @param requestId - The approval request ID to resolve
   * @param resolution - The resolution details
   */
  async resolveApproval(
    requestId: string,
    resolution: { status: "approved" | "denied"; by: string; reason?: string },
  ): Promise<SintApprovalResolutionResponse> {
    return this.request<SintApprovalResolutionResponse>(
      "POST",
      `/v1/approvals/${encodeURIComponent(requestId)}/resolve`,
      resolution,
    );
  }

  /**
   * Retrieve ledger events for audit.
   *
   * @param agentId - Filter by agent (optional)
   * @param limit - Max events to return (default: 100)
   */
  async ledger(agentId?: string, limit = 100): Promise<{ events: unknown[] }> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (agentId) params.set("agentId", agentId);
    return this.request<{ events: unknown[] }>("GET", `/v1/ledger?${params}`);
  }

  /** Fetch all JSON schemas served by the gateway. */
  async schemas(): Promise<SintSchemaIndex> {
    return this.request<SintSchemaIndex>("GET", "/v1/schemas");
  }

  /**
   * Fetch a single JSON schema by name.
   *
   * @param name - Schema name (e.g. "SintRequest", "PolicyDecision")
   */
  async schema(name: string): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>(
      "GET",
      `/v1/schemas/${encodeURIComponent(name)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Convenience factory
// ---------------------------------------------------------------------------

/**
 * Create a SintClient instance.
 *
 * @example
 * const sint = createSintClient({ baseUrl: "http://localhost:3000" });
 */
export function createSintClient(config: SintClientConfig): SintClient {
  return new SintClient(config);
}
