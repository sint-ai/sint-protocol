/**
 * SINT Gateway Server — Structured Logging Middleware.
 *
 * JSON-formatted request/response logging with latency tracking.
 *
 * @module @pshkv/gateway-server/middleware/logging
 */

import type { Context, Next } from "hono";

export interface LogEntry {
  timestamp: string;
  level: "info" | "warn" | "error";
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  requestId?: string;
  error?: string;
}

/**
 * Structured JSON logging middleware.
 * Logs every request with method, path, status, and latency.
 */
export function structuredLogging() {
  return async (c: Context, next: Next) => {
    const start = Date.now();
    const method = c.req.method;
    const path = new URL(c.req.url).pathname;

    try {
      await next();
    } catch (err) {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: "error",
        method,
        path,
        status: 500,
        latencyMs: Date.now() - start,
        requestId: c.res?.headers.get("x-request-id") ?? undefined,
        error: err instanceof Error ? err.message : String(err),
      };
      console.error(JSON.stringify(entry));
      throw err;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: c.res.status >= 400 ? "warn" : "info",
      method,
      path,
      status: c.res.status,
      latencyMs: Date.now() - start,
      requestId: c.res.headers.get("x-request-id") ?? undefined,
    };
    console.log(JSON.stringify(entry));
  };
}
