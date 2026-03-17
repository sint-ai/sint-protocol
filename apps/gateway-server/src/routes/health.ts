/**
 * SINT Gateway Server — Health route.
 */

import { Hono } from "hono";
import type { ServerContext } from "../server.js";

export function healthRoutes(ctx: ServerContext): Hono {
  const app = new Hono();

  app.get("/v1/health", (c) => {
    return c.json({
      status: "ok",
      version: "0.1.0",
      protocol: "SINT Gate",
      tokens: ctx.tokenStore.size,
      ledgerEvents: ctx.ledger.length,
      revokedTokens: ctx.revocationStore.size,
    });
  });

  return app;
}
