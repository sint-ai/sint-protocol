/**
 * SINT Gateway Server — Token routes.
 */

import { Hono } from "hono";
import {
  issueCapabilityToken,
  delegateCapabilityToken,
  generateKeypair,
} from "@pshkv/gate-capability-tokens";
import type { ServerContext } from "../server.js";

export function tokenRoutes(ctx: ServerContext): Hono {
  const app = new Hono();

  // Issue a new capability token
  app.post("/v1/tokens", async (c) => {
    const body = await c.req.json();
    const { request, privateKey } = body;

    const result = issueCapabilityToken(request, privateKey);
    if (!result.ok) {
      return c.json({ error: result.error }, 400);
    }

    await ctx.tokenStore.store(result.value);

    ctx.ledger.append({
      eventType: "agent.capability.granted",
      agentId: request.subject,
      tokenId: result.value.tokenId,
      payload: {
        resource: request.resource,
        actions: request.actions,
      },
    });

    return c.json(result.value, 201);
  });

  // Delegate a token (attenuation only)
  app.post("/v1/tokens/delegate", async (c) => {
    const body = await c.req.json();
    const { parentTokenId, request, privateKey } = body;

    const parentToken = await ctx.tokenStore.get(parentTokenId);
    if (!parentToken) {
      return c.json({ error: "Parent token not found" }, 404);
    }

    const result = delegateCapabilityToken(parentToken, request, privateKey);
    if (!result.ok) {
      return c.json({ error: result.error }, 400);
    }

    await ctx.tokenStore.store(result.value);

    ctx.ledger.append({
      eventType: "agent.capability.granted",
      agentId: request.subject,
      tokenId: result.value.tokenId,
      payload: {
        resource: request.resource,
        actions: request.actions,
        delegatedFrom: parentTokenId,
      },
    });

    return c.json(result.value, 201);
  });

  // Revoke a capability token
  app.post("/v1/tokens/revoke", async (c) => {
    const { tokenId, reason, revokedBy } = await c.req.json();

    if (!tokenId || !reason || !revokedBy) {
      return c.json(
        { error: "tokenId, reason, and revokedBy are required" },
        400,
      );
    }

    // Revoke locally
    ctx.revocationStore.revoke(tokenId, reason, revokedBy);

    // Broadcast to all nodes via revocation bus (Redis pub/sub in production)
    await ctx.revocationBus.publish(tokenId, reason, revokedBy);

    // Invalidate cache entry
    await ctx.cache.delete(`token:${tokenId}`);

    const token = await ctx.tokenStore.get(tokenId);
    ctx.ledger.append({
      eventType: "agent.capability.revoked",
      agentId: token?.subject ?? "unknown",
      tokenId,
      payload: { reason, revokedBy },
    });

    return c.json({ status: "revoked", tokenId });
  });

  // Generate a keypair (utility endpoint for development)
  app.post("/v1/keypair", (c) => {
    const keypair = generateKeypair();
    return c.json(keypair);
  });

  return app;
}
