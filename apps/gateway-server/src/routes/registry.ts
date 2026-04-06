/**
 * SINT Gateway — Token Registry API routes.
 *
 * Exposes @sint/token-registry RegistryStore operations as REST endpoints
 * for ecosystem token verification and publishing.
 *
 * GET  /v1/registry/tokens                        — list registry entries (filterable)
 * GET  /v1/registry/tokens/:tokenId               — get a single registry entry
 * POST /v1/registry/publish                       — publish a signed capability token
 */

import { Hono } from "hono";
import type { RegistryStore } from "@sint/token-registry";
import { buildRegistryEntry } from "@sint/token-registry";

export interface RegistryRouteContext {
  readonly registryStore?: RegistryStore | undefined;
}

export function registryRoutes(ctx: RegistryRouteContext): Hono {
  const router = new Hono();

  router.get("/tokens", async (c) => {
    if (!ctx.registryStore) return c.json({ entries: [], count: 0 });
    const issuer = c.req.query("issuer");
    const toolScope = c.req.query("toolScope");
    const entries = await ctx.registryStore.list({ issuer, toolScope });
    return c.json({ entries, count: entries.length });
  });

  router.get("/tokens/:tokenId", async (c) => {
    const tokenId = c.req.param("tokenId");
    if (!ctx.registryStore) return c.json({ error: "Registry not configured" }, 503);
    const entry = await ctx.registryStore.get(tokenId);
    if (!entry) return c.json({ error: `Token ${tokenId} not found` }, 404);
    return c.json(entry);
  });

  router.post("/publish", async (c) => {
    if (!ctx.registryStore) return c.json({ error: "Registry not configured" }, 503);
    const body = await c.req.json().catch(() => null);
    if (!body || !body.token) return c.json({ error: "token is required" }, 400);
    try {
      const entry = buildRegistryEntry(body.token, body.publisherNote);
      await ctx.registryStore.publish(entry);
      return c.json(entry, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  return router;
}
