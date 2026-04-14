/**
 * SINT Gateway Server — Ledger routes.
 *
 * Uses the in-memory LedgerWriter as primary source of truth for
 * the current process. The persistent LedgerStore receives events
 * asynchronously for durability across restarts.
 */

import { Hono } from "hono";
import { queryLedger, generateProof } from "@pshkv/gate-evidence-ledger";
import type { ServerContext } from "../server.js";

export function ledgerRoutes(ctx: ServerContext): Hono {
  const app = new Hono();

  app.get("/v1/ledger", (c) => {
    const agentId = c.req.query("agentId");
    const eventType = c.req.query("eventType") as any;
    const limit = parseInt(c.req.query("limit") ?? "100", 10);
    const offset = parseInt(c.req.query("offset") ?? "0", 10);

    const events = queryLedger(ctx.ledger.getAll(), {
      agentId: agentId ?? undefined,
      eventType: eventType ?? undefined,
      limit,
      offset,
    });

    const serialized = events.map((e) => ({
      ...e,
      sequenceNumber: e.sequenceNumber.toString(),
    }));

    return c.json({
      events: serialized,
      total: ctx.ledger.length,
      chainIntegrity: ctx.ledger.verifyChain().ok,
    });
  });

  /**
   * GET /v1/ledger/query
   *
   * Semantic query endpoint — filter events by multiple criteria.
   * Returns events in descending timestamp order.
   *
   * Query params:
   *   agentId, resource, action, tier, from, to, eventType, limit (default 50)
   */
  app.get("/v1/ledger/query", (c) => {
    const agentId = c.req.query("agentId");
    const resource = c.req.query("resource");
    const action = c.req.query("action");
    const tier = c.req.query("tier");
    const from = c.req.query("from");
    const to = c.req.query("to");
    const eventType = c.req.query("eventType") as any;
    const limit = parseInt(c.req.query("limit") ?? "50", 10);

    let events = queryLedger(ctx.ledger.getAll(), {
      agentId: agentId ?? undefined,
      eventType: eventType ?? undefined,
      fromTimestamp: from ?? undefined,
      toTimestamp: to ?? undefined,
    });

    // Additional semantic filters not covered by base queryLedger
    if (resource) {
      events = events.filter(
        (e) =>
          typeof e.payload["resource"] === "string" &&
          e.payload["resource"] === resource,
      );
    }

    if (action) {
      events = events.filter(
        (e) =>
          typeof e.payload["action"] === "string" &&
          e.payload["action"] === action,
      );
    }

    if (tier) {
      events = events.filter(
        (e) =>
          typeof e.payload["tier"] === "string" &&
          e.payload["tier"] === tier,
      );
    }

    // Sort descending by timestamp
    const sorted = [...events].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    const paginated = sorted.slice(0, limit);

    const serialized = paginated.map((e) => ({
      ...e,
      sequenceNumber: e.sequenceNumber.toString(),
    }));

    return c.json({
      events: serialized,
      total: sorted.length,
      limit,
      chainIntegrity: ctx.ledger.verifyChain().ok,
    });
  });

  /**
   * GET /v1/ledger/:eventId/proof
   *
   * Returns the NIST-style chain-of-custody proof for a specific event.
   */
  app.get("/v1/ledger/:eventId/proof", (c) => {
    const eventId = c.req.param("eventId");

    const allEvents = [...ctx.ledger.getAll()];
    const proof = generateProof(allEvents, eventId);

    if (!proof) {
      return c.json({ error: "Event not found", eventId }, 404);
    }

    return c.json(proof);
  });

  return app;
}
