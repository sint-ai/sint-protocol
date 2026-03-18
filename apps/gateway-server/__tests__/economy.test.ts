/**
 * SINT Gateway Server — Economy route tests.
 *
 * Tests the economy HTTP endpoints using Hono's built-in test client.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createApp, createContext, type ServerContext } from "../src/server.js";
import type { Hono } from "hono";
import type { EconomyRouteContext } from "../src/routes/economy.js";
import {
  InMemoryBalanceAdapter,
  InMemoryBudgetAdapter,
  computeActionCost,
} from "@sint/bridge-economy";

describe("Gateway Server — Economy Routes", () => {
  let ctx: ServerContext;
  let app: Hono;
  let balanceAdapter: InMemoryBalanceAdapter;
  let budgetAdapter: InMemoryBudgetAdapter;

  beforeEach(() => {
    ctx = createContext();
    balanceAdapter = new InMemoryBalanceAdapter(250);
    budgetAdapter = new InMemoryBudgetAdapter(1000);

    const econCtx: EconomyRouteContext = {
      serverContext: ctx,
      balancePort: balanceAdapter,
      budgetPort: budgetAdapter,
    };

    app = createApp(ctx, { economyContext: econCtx });
  });

  // ── Balance ──

  it("GET /v1/economy/balance/:agentId returns balance", async () => {
    const res = await app.request("/v1/economy/balance/agent-123");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.agentId).toBe("agent-123");
    expect(body.balance).toBe(250);
  });

  it("GET /v1/economy/balance/:agentId reflects withdrawals", async () => {
    await balanceAdapter.withdraw("agent-456", 50, "test", "test");

    const res = await app.request("/v1/economy/balance/agent-456");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.balance).toBe(200);
  });

  // ── Budget ──

  it("GET /v1/economy/budget/:agentId returns budget status", async () => {
    const res = await app.request("/v1/economy/budget/agent-123");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.agentId).toBe("agent-123");
    expect(body.totalBudget).toBe(1000);
    expect(typeof body.remainingBudget).toBe("number");
  });

  it("GET /v1/economy/budget/:agentId shows alert at high usage", async () => {
    budgetAdapter.setUsage("agent-high", 850);

    const res = await app.request("/v1/economy/budget/agent-high");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.isAlert).toBe(true);
    expect(body.usagePercent).toBeGreaterThanOrEqual(80);
  });

  // ── Quote ──

  it("POST /v1/economy/quote returns cost estimate for MCP tool", async () => {
    const res = await app.request("/v1/economy/quote", {
      method: "POST",
      body: JSON.stringify({ action: "call", resource: "mcp://tool/test" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.baseCost).toBe(6);
    expect(body.totalCost).toBe(9); // ceil(6 × 1.0 × 1.5)
    expect(body.globalMarkup).toBe(1.5);
  });

  it("POST /v1/economy/quote returns cost for capsule execution", async () => {
    const res = await app.request("/v1/economy/quote", {
      method: "POST",
      body: JSON.stringify({ action: "exec", resource: "capsule://test/cap" }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.baseCost).toBe(12);
    expect(body.totalCost).toBe(18); // ceil(12 × 1.0 × 1.5)
  });

  // ── Events ──

  it("GET /v1/economy/events returns empty array when no events", async () => {
    const res = await app.request("/v1/economy/events");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.events).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("GET /v1/economy/events filters to economy events only", async () => {
    // Write some ledger events directly
    ctx.ledger.append({
      eventType: "policy.evaluated" as any,
      agentId: "agent1",
      payload: { decision: "allow" },
    });
    ctx.ledger.append({
      eventType: "economy.action.billed" as any,
      agentId: "agent1",
      payload: { tokens: 9, action: "call" },
    });

    const res = await app.request("/v1/economy/events");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.total).toBe(1); // Only the economy event
    expect(body.events[0].eventType).toBe("economy.action.billed");
  });
});

describe("Gateway Server — Economy Routes Not Configured", () => {
  it("economy routes not mounted when no economy context", async () => {
    const ctx = createContext();
    const app = createApp(ctx); // No economy context

    const res = await app.request("/v1/economy/balance/agent-123");
    expect(res.status).toBe(404);
  });
});
