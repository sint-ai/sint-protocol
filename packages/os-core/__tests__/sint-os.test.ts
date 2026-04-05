import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SintOS } from "../src/sint-os.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockGatewayHealthy() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ status: "ok", protocol: "sint/1.0" }),
  });
}

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

function mockGatewayDeny() {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      action: "deny",
      assignedTier: "T2",
      reason: "Policy denied",
    }),
  });
}

describe("SintOS", () => {
  let os: SintOS;

  beforeEach(() => {
    os = new SintOS({
      gatewayUrl: "http://localhost:4100",
      agentId: "test-agent",
      evidenceHud: { enabled: true, maxEntries: 10 },
    });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("boots and checks gateway health", async () => {
    mockGatewayHealthy();

    const result = await os.boot();

    expect(result.success).toBe(true);
    expect(result.components["gateway"]).toBe(true);
    expect(result.components["openclawAdapter"]).toBe(true);
    expect(result.components["evidenceHud"]).toBe(true);
    expect(os.isRunning()).toBe(true);
  });

  it("boots even when gateway is down", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const result = await os.boot();

    expect(result.success).toBe(true); // adapter still works
    expect(result.components["gateway"]).toBe(false);
    expect(result.components["openclawAdapter"]).toBe(true);
  });

  it("governs tool calls and tracks stats", async () => {
    mockGatewayHealthy();
    await os.boot();

    // T0 call — no gateway needed
    const r1 = await os.govern("tool", { tool: "read", params: {} });
    expect(r1.allowed).toBe(true);
    expect(r1.tier).toBe("T0");

    // T1 call — goes to gateway
    mockGatewayAllow();
    const r2 = await os.govern("tool", { tool: "write", params: {} });
    expect(r2.allowed).toBe(true);

    // T3 call — denied
    mockGatewayDeny();
    const r3 = await os.govern("tool", { tool: "exec", params: {} });
    expect(r3.allowed).toBe(false);

    const status = os.status();
    expect(status.stats.totalIntercepts).toBe(3);
    expect(status.stats.approved).toBe(2);
    expect(status.stats.denied).toBe(1);
  });

  it("tracks evidence in HUD", async () => {
    mockGatewayHealthy();
    await os.boot();

    mockGatewayAllow();
    await os.govern("tool", { tool: "write", params: {} });

    const hud = os.getEvidenceHUD()!;
    expect(hud.count).toBe(1);
    expect(hud.getEntries()[0]!.outcome).toBe("approve");
  });

  it("returns full status", async () => {
    mockGatewayHealthy();
    await os.boot();

    const status = os.status();
    expect(status.running).toBe(true);
    expect(status.gateway.url).toBe("http://localhost:4100");
    expect(status.openclaw.wsUrl).toBe("ws://127.0.0.1:18789");
    expect(status.evidenceHud.enabled).toBe(true);
    expect(status.activeStates).toEqual([]);
  });

  it("shuts down cleanly", async () => {
    mockGatewayHealthy();
    await os.boot();
    expect(os.isRunning()).toBe(true);

    await os.shutdown();
    expect(os.isRunning()).toBe(false);
  });

  it("provides adapter for direct governance", async () => {
    const adapter = os.getAdapter();
    expect(adapter).toBeDefined();

    const result = await adapter.governToolCall({
      tool: "read",
      params: {},
    });
    expect(result.allowed).toBe(true);
  });

  it("initializes without avatar when not configured", () => {
    expect(os.getAvatar()).toBeNull();
  });

  it("initializes with avatar when configured", () => {
    const osWithAvatar = new SintOS({
      gatewayUrl: "http://localhost:4100",
      agentId: "test-agent",
      avatar: { serverUrl: "http://localhost:3005" },
    });
    expect(osWithAvatar.getAvatar()).not.toBeNull();
  });
});
