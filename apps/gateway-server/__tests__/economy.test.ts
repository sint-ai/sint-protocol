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
  type IX402Port,
} from "@sint/bridge-economy";

describe("Gateway Server — Economy Routes", () => {
  let ctx: ServerContext;
  let app: Hono;
  let balanceAdapter: InMemoryBalanceAdapter;
  let budgetAdapter: InMemoryBudgetAdapter;
  let x402Port: IX402Port;

  beforeEach(() => {
    ctx = createContext();
    balanceAdapter = new InMemoryBalanceAdapter(250);
    budgetAdapter = new InMemoryBudgetAdapter(1000);
    x402Port = {
      async getQuote(candidate) {
        return {
          ok: true,
          value: {
            routeId: candidate.routeId,
            endpoint: candidate.x402?.endpoint ?? "https://x402.example/quote",
            priceUsd: 0.02,
            currency: "USD",
          },
        };
      },
    };

    const econCtx: EconomyRouteContext = {
      serverContext: ctx,
      balancePort: balanceAdapter,
      budgetPort: budgetAdapter,
      x402Port,
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

  it("POST /v1/economy/route selects a cost-aware route", async () => {
    const res = await app.request("/v1/economy/route", {
      method: "POST",
      body: JSON.stringify({
        request: {
          requestId: "route-001",
          resource: "mcp://dispatch/tool",
          action: "call",
          params: {},
        },
        candidates: [
          {
            routeId: "rmf-primary",
            action: "call",
            resource: "open-rmf://fleet-a/dispatch",
            costMultiplier: 1.4,
            latencyMs: 18,
            reliability: 0.95,
          },
          {
            routeId: "sparkplug-edge",
            action: "publish",
            resource: "mqtt-sparkplug://broker/ns/group/node/cmd",
            costMultiplier: 0.8,
            latencyMs: 9,
            reliability: 0.9,
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.decision.routeId).toBe("sparkplug-edge");
    expect(body.decision.totalCostTokens).toBeGreaterThan(0);
  });

  it("POST /v1/economy/route applies x402 quote and returns viaX402=true", async () => {
    const res = await app.request("/v1/economy/route", {
      method: "POST",
      body: JSON.stringify({
        request: {
          requestId: "route-002",
          resource: "mcp://premium/tool",
          action: "call",
          params: {},
        },
        candidates: [
          {
            routeId: "x402-premium",
            action: "call",
            resource: "mcp://premium/tool",
            latencyMs: 6,
            x402: {
              enabled: true,
              endpoint: "https://x402.example/quote",
            },
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.decision.routeId).toBe("x402-premium");
    expect(body.decision.viaX402).toBe(true);
  });

  it("POST /v1/economy/route returns 409 when no candidate satisfies constraints", async () => {
    const res = await app.request("/v1/economy/route", {
      method: "POST",
      body: JSON.stringify({
        request: {
          requestId: "route-003",
          resource: "mcp://dispatch/tool",
          action: "call",
          params: {},
        },
        budgetRemainingTokens: 1,
        candidates: [
          {
            routeId: "expensive-route",
            action: "call",
            resource: "mcp://expensive/tool",
            costMultiplier: 10,
            latencyMs: 2,
          },
        ],
      }),
      headers: { "Content-Type": "application/json" },
    });
    expect(res.status).toBe(409);
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
