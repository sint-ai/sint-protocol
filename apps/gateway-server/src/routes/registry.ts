/**
 * SINT Gateway — Token Registry API routes.
 *
 * Exposes @sint/token-registry RegistryStore operations as REST endpoints
 * for ecosystem token verification and publishing.
 *
 * GET  /v1/registry          — list registry entries (filterable by ?issuer= and ?resource=)
 * GET  /v1/registry/:tokenId — get a single registry entry
 * POST /v1/registry/publish  — publish a capability token to the registry
 */

import { Hono } from "hono";
import type { RegistryStore } from "@sint/token-registry";
import { buildRegistryEntry } from "@sint/token-registry";
import type { RegistryPublishRequest } from "@sint/token-registry";

export interface RegistryRouteContext {
  readonly registryStore?: RegistryStore | undefined;
}

export function registryRoutes(ctx: RegistryRouteContext): Hono {
  const router = new Hono();

  // GET / — list tokens (optional ?issuer= and ?resource= query params)
  router.get("/", async (c) => {
    if (!ctx.registryStore) return c.json({ entries: [], count: 0 });
    const issuer = c.req.query("issuer");
    const resource = c.req.query("resource");
    const entries = await ctx.registryStore.list({
      ...(issuer !== undefined && { issuer }),
      ...(resource !== undefined && { resource }),
    });
    return c.json({ entries, count: entries.length });
  });

  // GET /:tokenId — single lookup → 200 with entry or 404
  router.get("/:tokenId", async (c) => {
    const tokenId = c.req.param("tokenId");
    if (!ctx.registryStore) return c.json({ error: "Registry not configured" }, 503);
    const entry = await ctx.registryStore.get(tokenId);
    if (!entry) return c.json({ error: `Token ${tokenId} not found` }, 404);
    return c.json(entry);
  });

  // POST /publish — body: RegistryPublishRequest → 201 with RegistryEntry, 400 if expired
  router.post("/publish", async (c) => {
    if (!ctx.registryStore) return c.json({ error: "Registry not configured" }, 503);
    const body = await c.req.json().catch(() => null) as RegistryPublishRequest | null;
    if (!body || !body.tokenId || !body.issuer || !body.subject || !body.resource || !body.actions || !body.validFrom || !body.validTo) {
      return c.json({ error: "tokenId, issuer, subject, resource, actions, validFrom, and validTo are required" }, 400);
    }
    try {
      const entry = buildRegistryEntry(body);
      await ctx.registryStore.publish(entry);
      return c.json(entry, 201);
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : String(err) }, 400);
    }
  });

  return router;
}
