/**
 * SINT Gateway Server — Middleware.
 *
 * Request ID generation, error handling, CORS, and logging.
 *
 * @module @sint/gateway-server/middleware
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { generateUUIDv7 } from "@pshkv/gate-capability-tokens";

/**
 * Apply standard middleware to a Hono app.
 */
export function applyMiddleware(app: Hono): void {
  app.use("*", async (c, next) => {
    const origin = c.req.header("origin");
    if (origin && (process.env.SINT_ENV ?? process.env.NODE_ENV) === "production") {
      const allowed = (process.env.SINT_ALLOWED_ORIGINS ?? "")
        .split(",").map(value => value.trim()).filter(Boolean);
      if (!allowed.includes(origin)) return c.json({ error: "Origin not allowed" }, 403);
    }
    await next();
  });
  // CORS
  app.use("*", cors({
    origin: origin => {
      if ((process.env.SINT_ENV ?? process.env.NODE_ENV) !== "production") return origin;
      return (process.env.SINT_ALLOWED_ORIGINS ?? "").split(",").map(value => value.trim()).includes(origin)
        ? origin : "";
    },
  }));

  // Request ID
  app.use("*", async (c, next) => {
    const requestId = c.req.header("x-request-id") ?? generateUUIDv7();
    c.header("x-request-id", requestId);
    await next();
  });

  // Error handler
  app.onError((err, c) => {
    console.error(`[SINT] Error: ${err.message}`);
    return c.json(
      {
        error: "Internal server error",
        message: err.message,
      },
      500,
    );
  });
}
