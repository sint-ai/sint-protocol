/**
 * SINT Dashboard — API Client Tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("API Client", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getHealth fetches /v1/health", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: "ok",
        version: "0.1.0",
        protocol: "SINT Gate",
        tokens: 3,
        ledgerEvents: 42,
        revokedTokens: 1,
      }),
    });

    const { getHealth } = await import("../src/api/client.js");
    const health = await getHealth();

    expect(mockFetch).toHaveBeenCalledWith(
      "/v1/health",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
    expect(health.status).toBe("ok");
    expect(health.tokens).toBe(3);
    expect(health.ledgerEvents).toBe(42);
  });

  it("getPendingApprovals fetches /v1/approvals/pending", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        count: 2,
        requests: [
          {
            requestId: "req-1",
            reason: "T3 escalation",
            requiredTier: "T3_COMMIT",
            resource: "mcp://exec/run",
            action: "exec.run",
            agentId: "agent-abc",
            createdAt: "2026-01-01T00:00:00Z",
            expiresAt: "2026-01-01T00:02:00Z",
          },
          {
            requestId: "req-2",
            reason: "T2 escalation",
            requiredTier: "T2_ACT",
            resource: "mcp://fs/deleteFile",
            action: "call",
            agentId: "agent-xyz",
            createdAt: "2026-01-01T00:00:00Z",
            expiresAt: "2026-01-01T00:02:00Z",
          },
        ],
      }),
    });

    const { getPendingApprovals } = await import("../src/api/client.js");
    const result = await getPendingApprovals();

    expect(result.count).toBe(2);
    expect(result.requests).toHaveLength(2);
    expect(result.requests[0]!.requestId).toBe("req-1");
  });

  it("resolveApproval posts to /v1/approvals/:id/resolve", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        requestId: "req-1",
        resolution: { status: "approved", by: "operator" },
      }),
    });

    const { resolveApproval } = await import("../src/api/client.js");
    await resolveApproval("req-1", {
      status: "approved",
      by: "operator",
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/v1/approvals/req-1/resolve",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ status: "approved", by: "operator" }),
      }),
    );
  });

  it("getLedger fetches /v1/ledger with query params", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        events: [],
        total: 0,
        chainIntegrity: true,
      }),
    });

    const { getLedger } = await import("../src/api/client.js");
    await getLedger({ limit: 10, agentId: "agent-1" });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/ledger"),
      expect.any(Object),
    );

    const callUrl = mockFetch.mock.calls[0]![0] as string;
    expect(callUrl).toContain("limit=10");
    expect(callUrl).toContain("agentId=agent-1");
  });

  it("throws on non-OK response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    const { getHealth } = await import("../src/api/client.js");
    await expect(getHealth()).rejects.toThrow("API 500");
  });

  it("generateKeypair posts to /v1/keypair", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        publicKey: "pub123",
        privateKey: "priv456",
      }),
    });

    const { generateKeypair } = await import("../src/api/client.js");
    const kp = await generateKeypair();

    expect(kp.publicKey).toBe("pub123");
    expect(kp.privateKey).toBe("priv456");
    expect(mockFetch).toHaveBeenCalledWith(
      "/v1/keypair",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
