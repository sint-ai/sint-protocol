import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SintGovernanceHandler } from "../src/handler.js";
import { SintDeniedError } from "../src/errors.js";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockGatewayResponse(
  outcome: "approve" | "deny" | "escalate",
  opts?: { reason?: string; tier?: number }
) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      outcome,
      reason: opts?.reason,
      tier: opts?.tier,
      evidenceId: "ev-123",
    }),
  });
}

describe("SintGovernanceHandler", () => {
  let handler: SintGovernanceHandler;

  beforeEach(() => {
    handler = new SintGovernanceHandler({
      gatewayUrl: "http://localhost:4100",
      agentId: "test-agent",
    });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows approved tool calls", async () => {
    mockGatewayResponse("approve");

    // Should not throw
    await handler.handleToolStart(
      { name: "search" },
      '{"query": "hello"}',
      "run-1"
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe("http://localhost:4100/v1/intercept");
    const body = JSON.parse(opts.body);
    expect(body.agentId).toBe("test-agent");
    expect(body.resource).toBe("tool:search");
    expect(body.action).toBe("execute");
  });

  it("throws SintDeniedError on denied tool calls", async () => {
    mockGatewayResponse("deny", {
      reason: "Insufficient capability scope",
      tier: 3,
    });

    await expect(
      handler.handleToolStart(
        { name: "delete_file" },
        '{"path": "/etc/passwd"}',
        "run-2"
      )
    ).rejects.toThrow(SintDeniedError);

    try {
      mockGatewayResponse("deny", {
        reason: "Insufficient capability scope",
        tier: 3,
      });
      await handler.handleToolStart(
        { name: "delete_file" },
        '{"path": "/etc/passwd"}',
        "run-3"
      );
    } catch (err) {
      expect(err).toBeInstanceOf(SintDeniedError);
      const denied = err as SintDeniedError;
      expect(denied.toolName).toBe("delete_file");
      expect(denied.reason).toBe("Insufficient capability scope");
      expect(denied.tier).toBe(3);
    }
  });

  it("does not throw when throwOnDeny is false", async () => {
    const lenientHandler = new SintGovernanceHandler({
      gatewayUrl: "http://localhost:4100",
      agentId: "test-agent",
      throwOnDeny: false,
    });

    mockGatewayResponse("deny", { reason: "No permission" });

    // Should not throw
    await lenientHandler.handleToolStart(
      { name: "dangerous_tool" },
      "{}",
      "run-4"
    );
  });

  it("uses custom resource and action mappers", async () => {
    const customHandler = new SintGovernanceHandler({
      gatewayUrl: "http://localhost:4100",
      agentId: "test-agent",
      resourceMapper: (name) => `langchain:${name}`,
      actionMapper: (name) =>
        name.startsWith("write") ? "write" : "read",
    });

    mockGatewayResponse("approve");

    await customHandler.handleToolStart(
      { name: "write_document" },
      "{}",
      "run-5"
    );

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.resource).toBe("langchain:write_document");
    expect(body.action).toBe("write");
  });

  it("tracks intercept log", async () => {
    mockGatewayResponse("approve");
    mockGatewayResponse("approve");

    await handler.handleToolStart({ name: "tool_a" }, "{}", "run-6");
    await handler.handleToolStart({ name: "tool_b" }, "{}", "run-7");

    const log = handler.getInterceptLog();
    expect(log).toHaveLength(2);
    expect(log[0]!.toolName).toBe("tool_a");
    expect(log[1]!.toolName).toBe("tool_b");

    handler.clearLog();
    expect(handler.getInterceptLog()).toHaveLength(0);
  });

  it("handles gateway timeout gracefully", async () => {
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          const err = new Error("Timeout");
          err.name = "AbortError";
          reject(err);
        })
    );

    await expect(
      handler.handleToolStart({ name: "slow_tool" }, "{}", "run-8")
    ).rejects.toThrow(SintDeniedError);
  });

  it("handles gateway connection error gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    await expect(
      handler.handleToolStart({ name: "any_tool" }, "{}", "run-9")
    ).rejects.toThrow(SintDeniedError);
  });

  it("sends token when configured", async () => {
    const tokenHandler = new SintGovernanceHandler({
      gatewayUrl: "http://localhost:4100",
      agentId: "test-agent",
      token: "cap-token-xyz",
    });

    mockGatewayResponse("approve");

    await tokenHandler.handleToolStart(
      { name: "search" },
      "{}",
      "run-10"
    );

    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.token).toBe("cap-token-xyz");
  });

  it("sends API key header when configured", async () => {
    const apiKeyHandler = new SintGovernanceHandler({
      gatewayUrl: "http://localhost:4100",
      agentId: "test-agent",
      apiKey: "admin-key-123",
    });

    mockGatewayResponse("approve");

    await apiKeyHandler.handleToolStart(
      { name: "admin_tool" },
      "{}",
      "run-11"
    );

    const headers = mockFetch.mock.calls[0]![1].headers;
    expect(headers["X-API-Key"]).toBe("admin-key-123");
  });
});
