/**
 * SINT Gateway — Memory API routes.
 *
 * Exposes @sint/memory MemoryBank operations as REST endpoints
 * for SINT Console Operator module integration.
 *
 * GET  /v1/memory/recall?q=<query>&limit=<n>  — search memory
 * POST /v1/memory/store                        — store entry
 * DELETE /v1/memory/:key                       — forget entry
 */

import { Hono } from "hono";
import type { MemoryBank } from "@sint/memory";

/** Context for memory routes — memoryBank is optional; missing → 503. */
export interface MemoryRouteContext {
  readonly memoryBank?: MemoryBank;
}

export function memoryRoutes(memCtx: MemoryRouteContext): Hono {
  const app = new Hono();

  app.get("/v1/memory/recall", async (c) => {
    const q = c.req.query("q") ?? "";
    const limit = parseInt(c.req.query("limit") ?? "10", 10);

    if (!memCtx.memoryBank) {
      return c.json({ error: "Memory bank not configured" }, 503);
    }

    const entries = await memCtx.memoryBank.recall(q, limit);
    return c.json({ entries, count: entries.length, query: q });
  });

  app.post("/v1/memory/store", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body.key !== "string" || body.value === undefined) {
      return c.json({ error: "key and value are required" }, 400);
    }

    if (!memCtx.memoryBank) {
      return c.json({ error: "Memory bank not configured" }, 503);
    }

    const tags = Array.isArray(body.tags) ? (body.tags as string[]) : [];
    const persist = body.persist === true;

    const entry = await memCtx.memoryBank.store(body.key, body.value, tags, persist);
    return c.json({ stored: true, key: body.key, persist, entryKey: entry.key });
  });

  app.delete("/v1/memory/:key", async (c) => {
    const key = c.req.param("key");

    if (!memCtx.memoryBank) {
      return c.json({ error: "Memory bank not configured" }, 503);
    }

    await memCtx.memoryBank.forget(key);
    return c.json({ forgotten: true, key });
  });

  return app;
}
