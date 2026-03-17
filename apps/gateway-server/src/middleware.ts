/**
 * SINT Gateway Server — Middleware.
 *
 * Request ID generation, error handling, CORS, and logging.
 *
 * @module @sint/gateway-server/middleware
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { generateUUIDv7 } from "@sint/gate-capability-tokens";

/**
 * Apply standard middleware to a Hono app.
 */
export function applyMiddleware(app: Hono): void {
  // CORS
  app.use("*", cors());

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
