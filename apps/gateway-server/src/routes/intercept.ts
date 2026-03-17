/**
 * SINT Gateway Server — Intercept routes.
 */

import { Hono } from "hono";
import type { SintRequest } from "@sint/core";
import { sintRequestSchema } from "@sint/core";
import type { ServerContext } from "../server.js";

export function interceptRoutes(ctx: ServerContext): Hono {
  const app = new Hono();

  // Single request interception
  app.post("/v1/intercept", async (c) => {
    const body = await c.req.json();
    const parsed = sintRequestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        { error: "Invalid request", details: parsed.error.issues },
        400,
      );
    }

    const decision = ctx.gateway.intercept(parsed.data as SintRequest);

    ctx.ledger.append({
      eventType: "request.received",
      agentId: parsed.data.agentId,
      tokenId: parsed.data.tokenId,
      payload: {
        resource: parsed.data.resource,
        action: parsed.data.action,
        decision: decision.action,
      },
    });

    return c.json(decision);
  });

  // Batch interception — 207 Multi-Status
  app.post("/v1/intercept/batch", async (c) => {
    const body = await c.req.json();

    if (!Array.isArray(body) || body.length === 0) {
      return c.json({ error: "Request body must be a non-empty array" }, 400);
    }

    if (body.length > 50) {
      return c.json({ error: "Maximum 50 requests per batch" }, 400);
    }

    const results = body.map((item: unknown) => {
      const parsed = sintRequestSchema.safeParse(item);
      if (!parsed.success) {
        return {
          status: 400,
          error: "Invalid request",
          details: parsed.error.issues,
        };
      }

      const decision = ctx.gateway.intercept(parsed.data as SintRequest);

      ctx.ledger.append({
        eventType: "request.received",
        agentId: parsed.data.agentId,
        tokenId: parsed.data.tokenId,
        payload: {
          resource: parsed.data.resource,
          action: parsed.data.action,
          decision: decision.action,
        },
      });

      return { status: 200, decision };
    });

    return c.json(results, 207);
  });

  return app;
}
