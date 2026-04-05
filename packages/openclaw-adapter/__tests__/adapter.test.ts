import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenClawAdapter } from "../src/adapter.js";
import { DEFAULT_PHYSICAL_POLICIES } from "../src/cross-system.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockGatewayAllow() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      action: "allow",
      assignedTier: "T1",
      evidenceId: "ev-001",
    }),
  });
}

function mockGatewayDeny(reason: string) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      action: "deny",
      assignedTier: "T2",
      reason,
    }),
  });
}

function mockGatewayEscalate() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      action: "escalate",
      assignedTier: "T3",
      approvalRequestId: "apr-123",
    }),
  });
}

describe("OpenClawAdapter", () => {
  let adapter: OpenClawAdapter;

  beforeEach(() => {
    adapter = new OpenClawAdapter({
      gatewayUrl: "http://localhost:4100",
      agentId: "test-agent",
      crossSystemPolicies: DEFAULT_PHYSICAL_POLICIES,
    });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Tool Calls ---

  it("auto-approves T0 tool calls without gateway", async () => {
    const result = await adapter.governToolCall({
      tool: "read",
      params: { path: "/foo" },
    });

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe("T0");
    expect(result.outcome).toBe("approve");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends T1 tool calls to gateway", async () => {
    mockGatewayAllow();

    const result = await adapter.governToolCall({
      tool: "write",
      params: { path: "/tmp/test.txt" },
    });

    expect(result.allowed).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, opts] = mockFetch.mock.calls[0]!;
    expect(url).toBe("http://localhost:4100/v1/intercept");
    const body = JSON.parse(opts.body);
    expect(body.resource).toBe("openclaw.tool:write");
    expect(body.agentId).toBe("test-agent");
  });

  it("handles gateway deny", async () => {
    mockGatewayDeny("Insufficient permissions");

    const result = await adapter.governToolCall({
      tool: "exec",
      params: { command: "rm -rf /" },
    });

    expect(result.allowed).toBe(false);
    expect(result.outcome).toBe("deny");
    expect(result.reason).toBe("Insufficient permissions");
  });

  it("handles gateway escalate", async () => {
    mockGatewayEscalate();

    const result = await adapter.governToolCall({
      tool: "exec",
      params: { command: "deploy production" },
      elevated: true,
    });

    expect(result.allowed).toBe(false);
    expect(result.outcome).toBe("escalate");
    expect(result.approvalId).toBe("apr-123");
  });

  // --- Cross-System Policies ---

  it("denies tool calls via cross-system policy", async () => {
    adapter.getStateTracker().activate("robot.moving");

    const result = await adapter.governToolCall({
      tool: "exec",
      params: { command: "deploy", action: "execute" },
    });

    // Should be denied by cross-system policy BEFORE hitting gateway
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Cross-System Policy");
    expect(result.reason).toContain("robot is in motion");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("allows when cross-system condition is not active", async () => {
    // robot.moving NOT active
    mockGatewayAllow();

    const result = await adapter.governToolCall({
      tool: "write",
      params: { path: "/tmp/file" },
    });

    expect(result.allowed).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  // --- MCP Calls ---

  it("governs MCP calls through gateway", async () => {
    mockGatewayAllow();

    const result = await adapter.governMCPCall({
      server: "github",
      tool: "create_issue",
      args: { title: "test" },
    });

    expect(result.allowed).toBe(true);
    const body = JSON.parse(mockFetch.mock.calls[0]![1].body);
    expect(body.resource).toBe("openclaw.mcp:github/create_issue");
  });

  it("auto-approves T0 MCP read calls", async () => {
    const result = await adapter.governMCPCall({
      server: "db",
      tool: "list_records",
      args: {},
    });

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe("T0");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  // --- Node Actions ---

  it("auto-approves node status as T0", async () => {
    const result = await adapter.governNodeAction({
      nodeId: "iphone",
      action: "status",
      params: {},
    });

    expect(result.allowed).toBe(true);
    expect(result.tier).toBe("T0");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends physical node actions to gateway as T3", async () => {
    mockGatewayEscalate();

    const result = await adapter.governNodeAction({
      nodeId: "robot-arm",
      action: "invoke",
      params: { command: "move_joint", angle: 45 },
    });

    expect(result.tier).toBe("T3");
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  // --- Error Handling ---

  it("handles gateway timeout", async () => {
    mockFetch.mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          const err = new Error("Timeout");
          err.name = "AbortError";
          reject(err);
        }),
    );

    const result = await adapter.governToolCall({
      tool: "write",
      params: { path: "/tmp/x" },
    });

    expect(result.allowed).toBe(false);
    expect(result.outcome).toBe("deny");
    expect(result.reason).toContain("timed out");
  });

  it("handles gateway connection error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await adapter.governToolCall({
      tool: "edit",
      params: {},
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("ECONNREFUSED");
  });

  // --- Audit Log ---

  it("maintains intercept log", async () => {
    mockGatewayAllow();
    mockGatewayDeny("nope");

    await adapter.governToolCall({ tool: "read", params: {} }); // T0
    await adapter.governToolCall({ tool: "write", params: {} }); // T1
    await adapter.governToolCall({ tool: "exec", params: {} }); // T3

    const log = adapter.getInterceptLog();
    expect(log).toHaveLength(3);
    expect(log[0]!.tier).toBe("T0");
    expect(log[0]!.outcome).toBe("approve");
    expect(log[1]!.tier).toBe("T1");
    expect(log[1]!.outcome).toBe("approve");
    // exec goes to gateway which returns assignedTier T2 with deny
    expect(log[2]!.tier).toBe("T2");
    expect(log[2]!.outcome).toBe("deny");

    adapter.clearLog();
    expect(adapter.getInterceptLog()).toHaveLength(0);
  });

  // --- API Key ---

  it("sends API key header when configured", async () => {
    const adapterWithKey = new OpenClawAdapter({
      gatewayUrl: "http://localhost:4100",
      agentId: "test-agent",
      apiKey: "admin-key-xyz",
    });

    mockGatewayAllow();
    await adapterWithKey.governToolCall({ tool: "write", params: {} });

    const headers = mockFetch.mock.calls[0]![1].headers;
    expect(headers["X-API-Key"]).toBe("admin-key-xyz");
  });
});
