/**
 * SINT Gateway Server — Health route.
 */

import { Hono } from "hono";
import type { ServerContext } from "../server.js";

export function healthRoutes(ctx: ServerContext): Hono {
  const app = new Hono();

  app.get("/v1/health", async (c) => {
    const tokenCount = await ctx.tokenStore.count();

    return c.json({
      status: "ok",
      version: "0.1.0",
      protocol: "SINT Gate",
      tokens: tokenCount,
      ledgerEvents: ctx.ledger.length,
      revokedTokens: ctx.revocationStore.size,
      backend: ctx.backend,
    });
  });

  app.get("/v1/ready", async (c) => {
    const readiness = await ctx.readinessProbe();
    const status = readiness.ok ? 200 : 503;
    return c.json({
      status: readiness.ok ? "ready" : "degraded",
      backend: ctx.backend,
      checks: readiness.checks,
    }, status);
  });

  return app;
}
