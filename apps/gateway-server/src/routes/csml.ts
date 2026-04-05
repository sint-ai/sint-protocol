/**
 * SINT Gateway — CSML Score API routes.
 *
 * Exposes per-agent CSML scores for SINT Console Intelligence module.
 *
 * GET /v1/csml            — get CSML scores for all known agents
 * GET /v1/csml/:agentId   — get current CSML score for an agent
 */

import { Hono } from "hono";
import { computeCsml } from "@sint/gate-evidence-ledger";
import type { ServerContext } from "../server.js";

/** Context for CSML routes — uses the standard ServerContext ledger. */
export interface CsmlRouteContext {
  readonly serverContext: ServerContext;
}

export function csmlRoutes(csmlCtx: CsmlRouteContext): Hono {
  const app = new Hono();

  // List scores for ALL known agents — must come before /:agentId to avoid
  // shadowing; Hono matches in registration order and "all" would match /:agentId.
  app.get("/v1/csml", (c) => {
    const allEvents = csmlCtx.serverContext.ledger.getAll();
    const agentIds = [...new Set(allEvents.map((e) => e.agentId))];

    const scores = agentIds.map((agentId) => {
      const agentEvents = allEvents.filter((e) => e.agentId === agentId);
      const result = computeCsml(agentEvents);
      return {
        agentId,
        score: result.score,
        recommendation: result.recommendation,
        eventCount: result.eventCount,
        exceedsThreshold: result.exceedsThreshold(0.3),
      };
    });

    return c.json({ agents: scores, count: scores.length });
  });

  app.get("/v1/csml/:agentId", (c) => {
    const agentId = c.req.param("agentId");
    const allEvents = csmlCtx.serverContext.ledger.getAll();
    const agentEvents = allEvents.filter((e) => e.agentId === agentId);

    if (agentEvents.length === 0) {
      return c.json({
        agentId,
        score: null,
        recommendation: "insufficient_data",
        eventCount: 0,
      });
    }

    const result = computeCsml(agentEvents);
    return c.json({
      agentId,
      score: result.score,
      recommendation: result.recommendation,
      eventCount: result.eventCount,
      components: result.components,
      window: result.window,
      exceedsThreshold: result.exceedsThreshold(0.3),
    });
  });

  return app;
}
