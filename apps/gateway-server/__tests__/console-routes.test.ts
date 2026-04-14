/**
 * SINT Gateway Server — Console routes tests.
 *
 * Tests /v1/memory, /v1/delegations, and /v1/csml endpoints
 * using Hono's built-in test client.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createApp, createContext, type ServerContext } from "../src/server.js";
import type { Hono } from "hono";
import { MemoryBank, WorkingMemory, OperatorMemory } from "@pshkv/memory";
import { DelegationTree } from "@pshkv/interface-bridge";
import type { MemoryRouteContext } from "../src/routes/memory.js";
import type { DelegationRouteContext } from "../src/routes/delegations.js";
import type { CsmlRouteContext } from "../src/routes/csml.js";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeMemoryBank(ctx: ServerContext): MemoryBank {
  const working = new WorkingMemory();
  const persistent = new OperatorMemory(ctx.ledger, "test-agent");
  return new MemoryBank(working, persistent);
}

function makeDelegationTree(): DelegationTree {
  return new DelegationTree();
}

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

// ─── /v1/memory tests ────────────────────────────────────────────────────────

describe("Gateway Server — /v1/memory routes", () => {
  let ctx: ServerContext;
  let app: Hono;
  let memoryBank: MemoryBank;

  beforeEach(() => {
    ctx = createContext();
    memoryBank = makeMemoryBank(ctx);
    const memoryContext: MemoryRouteContext = { memoryBank };
    app = createApp(ctx, { memoryContext });
  });

  it("GET /v1/memory/recall returns 503 when memory bank absent from context", async () => {
    // memoryContext mounted but no memoryBank — routes return 503.
    const noMemApp = createApp(createContext(), { memoryContext: {} });
    const res = await noMemApp.request("/v1/memory/recall?q=test");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("Memory bank not configured");
  });

  it("GET /v1/memory/recall returns empty entries for empty memory", async () => {
    const res = await app.request("/v1/memory/recall?q=test");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.entries)).toBe(true);
    expect(body.count).toBe(0);
    expect(body.query).toBe("test");
  });

  it("GET /v1/memory/recall defaults q to empty string", async () => {
    const res = await app.request("/v1/memory/recall");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.query).toBe("");
  });

  it("GET /v1/memory/recall returns matching entries after store", async () => {
    await memoryBank.store("project-alpha", "payload data about alpha");
    const res = await app.request("/v1/memory/recall?q=alpha&limit=5");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBeGreaterThanOrEqual(1);
    expect(body.entries[0].key).toBe("project-alpha");
  });

  it("GET /v1/memory/recall respects limit param", async () => {
    await memoryBank.store("key-1", "value one");
    await memoryBank.store("key-2", "value two");
    await memoryBank.store("key-3", "value three");
    const res = await app.request("/v1/memory/recall?q=key&limit=2");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries.length).toBeLessThanOrEqual(2);
  });

  it("POST /v1/memory/store returns 400 when key is missing", async () => {
    const res = await app.request("/v1/memory/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "some value" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("key and value are required");
  });

  it("POST /v1/memory/store returns 400 when value is missing", async () => {
    const res = await app.request("/v1/memory/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "some-key" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("key and value are required");
  });

  it("POST /v1/memory/store returns 404 when memory context not mounted", async () => {
    // When memoryContext is not passed to createApp, routes are not mounted at all.
    const noMemApp = createApp(createContext());
    const res = await noMemApp.request("/v1/memory/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "k", value: "v" }),
    });
    expect(res.status).toBe(404);
  });

  it("POST /v1/memory/store returns 503 when memory bank is absent from context", async () => {
    // memoryContext is mounted but memoryBank is undefined — routes return 503.
    const noMemApp = createApp(createContext(), { memoryContext: {} });
    const res = await noMemApp.request("/v1/memory/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "k", value: "v" }),
    });
    expect(res.status).toBe(503);
  });

  it("POST /v1/memory/store stores entry successfully", async () => {
    const res = await app.request("/v1/memory/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "my-key", value: "my-value", tags: ["test"] }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stored).toBe(true);
    expect(body.key).toBe("my-key");
    expect(body.persist).toBe(false);
    expect(body.entryKey).toBe("my-key");
  });

  it("POST /v1/memory/store with persist=true stores persistently", async () => {
    const res = await app.request("/v1/memory/store", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: "persistent-key", value: "persistent-value", persist: true }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.stored).toBe(true);
    expect(body.persist).toBe(true);
  });

  it("DELETE /v1/memory/:key returns 503 when memory bank absent from context", async () => {
    // memoryContext mounted but no memoryBank — routes return 503.
    const noMemApp = createApp(createContext(), { memoryContext: {} });
    const res = await noMemApp.request("/v1/memory/some-key", { method: "DELETE" });
    expect(res.status).toBe(503);
  });

  it("DELETE /v1/memory/:key forgets the entry", async () => {
    await memoryBank.store("forget-me", "value", [], true);
    const res = await app.request("/v1/memory/forget-me", { method: "DELETE" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.forgotten).toBe(true);
    expect(body.key).toBe("forget-me");
  });
});

// ─── /v1/delegations tests ──────────────────────────────────────────────────

describe("Gateway Server — /v1/delegations routes", () => {
  let ctx: ServerContext;
  let app: Hono;
  let tree: DelegationTree;

  beforeEach(() => {
    ctx = createContext();
    tree = makeDelegationTree();
    const delegationContext: DelegationRouteContext = { delegationTree: tree };
    app = createApp(ctx, { delegationContext });
  });

  it("GET /v1/delegations returns empty nodes when tree has no entries", async () => {
    const res = await app.request("/v1/delegations");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.nodes)).toBe(true);
    expect(body.count).toBe(0);
  });

  it("GET /v1/delegations returns empty nodes when no tree configured", async () => {
    const noTreeApp = createApp(createContext(), { delegationContext: {} });
    const res = await noTreeApp.request("/v1/delegations");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.nodes).toEqual([]);
    expect(body.count).toBe(0);
  });

  it("GET /v1/delegations returns all nodes after adding entries", async () => {
    tree.add({
      tokenId: "token-abc",
      subagentId: "agent-pub-key",
      toolScope: ["ros2://*"],
      parentTokenId: null,
      depth: 0,
      issuedAt: new Date().toISOString(),
      expiresAt: futureISO(24),
      revoked: false,
    });
    const res = await app.request("/v1/delegations");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.nodes[0].tokenId).toBe("token-abc");
  });

  it("GET /v1/delegations/:tokenId returns 503 when no tree configured", async () => {
    const noTreeApp = createApp(createContext(), { delegationContext: {} });
    const res = await noTreeApp.request("/v1/delegations/token-xyz");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("Delegation tree not available");
  });

  it("GET /v1/delegations/:tokenId returns 404 for unknown tokenId", async () => {
    const res = await app.request("/v1/delegations/nonexistent-token");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("nonexistent-token");
  });

  it("GET /v1/delegations/:tokenId returns the correct node", async () => {
    const node = {
      tokenId: "token-def",
      subagentId: "agent-key-2",
      toolScope: ["mcp://filesystem/*"],
      parentTokenId: null,
      depth: 0,
      issuedAt: new Date().toISOString(),
      expiresAt: futureISO(12),
      revoked: false,
    };
    tree.add(node);
    const res = await app.request("/v1/delegations/token-def");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tokenId).toBe("token-def");
    expect(body.subagentId).toBe("agent-key-2");
    expect(body.depth).toBe(0);
  });
});

// ─── /v1/csml tests ─────────────────────────────────────────────────────────

describe("Gateway Server — /v1/csml routes", () => {
  let ctx: ServerContext;
  let app: Hono;

  beforeEach(() => {
    ctx = createContext();
    const csmlContext: CsmlRouteContext = { serverContext: ctx };
    app = createApp(ctx, { csmlContext });
  });

  it("GET /v1/csml returns empty agents array when ledger is empty", async () => {
    const res = await app.request("/v1/csml");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.agents)).toBe(true);
    expect(body.count).toBe(0);
  });

  it("GET /v1/csml/:agentId returns insufficient_data when no events", async () => {
    const res = await app.request("/v1/csml/agent-1");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agentId).toBe("agent-1");
    expect(body.score).toBeNull();
    expect(body.recommendation).toBe("insufficient_data");
    expect(body.eventCount).toBe(0);
  });

  it("GET /v1/csml/:agentId returns score after events are appended", async () => {
    ctx.ledger.append({
      eventType: "intercept.allow",
      agentId: "agent-scored",
      tokenId: "tok-1",
      payload: {},
    });
    const res = await app.request("/v1/csml/agent-scored");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agentId).toBe("agent-scored");
    expect(typeof body.score).toBe("number");
    expect(body.eventCount).toBe(1);
    expect(body.recommendation).toBeDefined();
    expect(typeof body.exceedsThreshold).toBe("boolean");
  });

  it("GET /v1/csml/:agentId returns components and window", async () => {
    ctx.ledger.append({
      eventType: "intercept.allow",
      agentId: "agent-detail",
      tokenId: "tok-2",
      payload: {},
    });
    const res = await app.request("/v1/csml/agent-detail");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.components).toBeDefined();
    expect(typeof body.components.attemptRate).toBe("number");
  });

  it("GET /v1/csml lists all agents with events", async () => {
    ctx.ledger.append({ eventType: "intercept.allow", agentId: "agent-x", tokenId: "t1", payload: {} });
    ctx.ledger.append({ eventType: "intercept.deny", agentId: "agent-y", tokenId: "t2", payload: {} });
    const res = await app.request("/v1/csml");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.count).toBe(2);
    const ids = body.agents.map((a: { agentId: string }) => a.agentId);
    expect(ids).toContain("agent-x");
    expect(ids).toContain("agent-y");
  });

  it("GET /v1/csml agent summary includes required fields", async () => {
    ctx.ledger.append({ eventType: "intercept.allow", agentId: "agent-z", tokenId: "t3", payload: {} });
    const res = await app.request("/v1/csml");
    const body = await res.json();
    const agent = body.agents[0];
    expect(agent).toHaveProperty("agentId");
    expect(agent).toHaveProperty("score");
    expect(agent).toHaveProperty("recommendation");
    expect(agent).toHaveProperty("eventCount");
    expect(agent).toHaveProperty("exceedsThreshold");
  });
});
