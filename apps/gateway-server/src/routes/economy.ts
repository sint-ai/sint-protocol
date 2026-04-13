/**
 * SINT Gateway Server — Economy routes.
 *
 * Provides HTTP endpoints for economy-related queries:
 * - GET  /v1/economy/balance/:agentId  → balance check
 * - GET  /v1/economy/budget/:agentId   → budget status
 * - POST /v1/economy/quote             → cost estimate (non-billing)
 * - POST /v1/economy/route             → cost-aware route decision
 * - GET  /v1/economy/events            → economic ledger events
 *
 * These routes are only available when an economy plugin is configured.
 *
 * @module @sint/gateway-server/routes/economy
 */

import { Hono } from "hono";
import type { ServerContext } from "../server.js";
import type { EconomyPluginHooks } from "@pshkv/gate-policy-gateway";
import type { IX402Port } from "@pshkv/bridge-economy";

/** Extended context with optional economy plugin. */
export interface EconomyRouteContext {
  readonly serverContext: ServerContext;
  readonly economyPlugin?: EconomyPluginHooks;
  readonly balancePort?: {
    getBalance(userId: string): Promise<{ ok: true; value: { balance: number; updatedAt: string } } | { ok: false; error: Error }>;
  };
  readonly budgetPort?: {
    checkBudget(params: { userId: string; action: string; resource: string; estimatedCost: number }): Promise<{ ok: true; value: { allowed: boolean; remainingBudget: number; totalBudget: number; usagePercent: number; isAlert: boolean } } | { ok: false; error: Error }>;
  };
  /** Optional x402 quote provider for pay-per-call route pricing. */
  readonly x402Port?: IX402Port;
}

const ECONOMY_EVENT_TYPES = [
  "economy.balance.checked",
  "economy.balance.deducted",
  "economy.balance.insufficient",
  "economy.budget.checked",
  "economy.budget.exceeded",
  "economy.budget.alert",
  "economy.trust.evaluated",
  "economy.trust.blocked",
  "economy.action.billed",
];

export function economyRoutes(econCtx: EconomyRouteContext): Hono {
  const app = new Hono();

  // ── GET /v1/economy/balance/:agentId ──

  app.get("/v1/economy/balance/:agentId", async (c) => {
    if (!econCtx.balancePort) {
      return c.json({ error: "Economy plugin not configured" }, 501);
    }

    const agentId = c.req.param("agentId");
    const result = await econCtx.balancePort.getBalance(agentId);

    if (!result.ok) {
      return c.json({ error: result.error.message }, 500);
    }

    return c.json({
      agentId,
      balance: result.value.balance,
      updatedAt: result.value.updatedAt,
    });
  });

  // ── GET /v1/economy/budget/:agentId ──

  app.get("/v1/economy/budget/:agentId", async (c) => {
    if (!econCtx.budgetPort) {
      return c.json({ error: "Economy plugin not configured" }, 501);
    }

    const agentId = c.req.param("agentId");
    const result = await econCtx.budgetPort.checkBudget({
      userId: agentId,
      action: "status_check",
      resource: "*",
      estimatedCost: 0,
    });

    if (!result.ok) {
      return c.json({ error: result.error.message }, 500);
    }

    return c.json({
      agentId,
      remainingBudget: result.value.remainingBudget,
      totalBudget: result.value.totalBudget,
      usagePercent: result.value.usagePercent,
      isAlert: result.value.isAlert,
    });
  });

  // ── POST /v1/economy/quote ──

  app.post("/v1/economy/quote", async (c) => {
    const body = await c.req.json<{ action: string; resource: string; costMultiplier?: number }>();

    if (!body.action || !body.resource) {
      return c.json({ error: "Missing required fields: action, resource" }, 400);
    }

    // Import pricing calculator inline to avoid circular dep
    const { computeActionCost } = await import("@pshkv/bridge-economy");

    const pricing = computeActionCost(
      {
        requestId: "quote",
        timestamp: new Date().toISOString(),
        agentId: "quote",
        tokenId: "quote",
        resource: body.resource,
        action: body.action,
        params: {},
      },
      body.costMultiplier ?? 1.0,
    );

    return c.json({
      baseCost: pricing.baseCost,
      costMultiplier: pricing.costMultiplier,
      globalMarkup: pricing.globalMarkup,
      totalCost: pricing.totalCost,
    });
  });

  // ── GET /v1/economy/events ──

  app.get("/v1/economy/events", async (c) => {
    const limit = parseInt(c.req.query("limit") ?? "50", 10);
    const offset = parseInt(c.req.query("offset") ?? "0", 10);

    // Read all events and filter to economy events
    const allEvents = econCtx.serverContext.ledger.getAll();
    const economyEvents = allEvents.filter((e) =>
      ECONOMY_EVENT_TYPES.includes(e.eventType),
    );

    const paged = economyEvents.slice(offset, offset + limit);

    return c.json({
      events: paged.map((e) => ({
        eventId: e.eventId,
        eventType: e.eventType,
        timestamp: e.timestamp,
        agentId: e.agentId,
        payload: e.payload,
      })),
      total: economyEvents.length,
      limit,
      offset,
    });
  });

  // ── POST /v1/economy/route ──

  app.post("/v1/economy/route", async (c) => {
    const body = await c.req.json<{
      request?: {
        requestId?: string;
        resource?: string;
        action?: string;
        params?: Record<string, unknown>;
      };
      candidates?: Array<{
        routeId: string;
        action: string;
        resource: string;
        costMultiplier?: number;
        latencyMs?: number;
        reliability?: number;
        x402?: { enabled: boolean; endpoint?: string; quotedUsd?: number };
      }>;
      budgetRemainingTokens?: number;
      maxLatencyMs?: number;
      latencyWeight?: number;
    }>();

    if (!body.request?.resource || !body.request?.action || !body.candidates?.length) {
      return c.json(
        { error: "Missing required fields: request.resource, request.action, candidates[]" },
        400,
      );
    }

    const { applyX402Quotes, selectCostAwareRoute } = await import("@pshkv/bridge-economy");

    const candidates = await applyX402Quotes(body.candidates, econCtx.x402Port);
    const decision = selectCostAwareRoute({
      request: {
        requestId: body.request.requestId ?? "route-quote",
        resource: body.request.resource,
        action: body.request.action,
        params: body.request.params ?? {},
      },
      candidates,
      budgetRemainingTokens: body.budgetRemainingTokens,
      maxLatencyMs: body.maxLatencyMs,
      latencyWeight: body.latencyWeight,
    });

    if (!decision) {
      return c.json(
        {
          error: "No candidate route satisfies budget/latency constraints",
        },
        409,
      );
    }

    return c.json({
      request: body.request,
      decision,
    });
  });

  return app;
}
