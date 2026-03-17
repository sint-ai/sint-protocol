/**
 * SINT Gateway Server — Ledger routes.
 */

import { Hono } from "hono";
import { queryLedger } from "@sint/gate-evidence-ledger";
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

  return app;
}
