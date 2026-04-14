/**
 * SINT Gateway — Delegation Tree API routes.
 *
 * Exposes the DelegationTree for SINT Console visualization.
 *
 * GET /v1/delegations          — list all delegation nodes
 * GET /v1/delegations/:tokenId — get specific node
 */

import { Hono } from "hono";
import type { DelegationTree } from "@pshkv/interface-bridge";

/** Context for delegation routes — tree is optional; missing → empty/503. */
export interface DelegationRouteContext {
  readonly delegationTree?: DelegationTree;
}

export function delegationRoutes(delCtx: DelegationRouteContext): Hono {
  const app = new Hono();

  app.get("/v1/delegations", (c) => {
    if (!delCtx.delegationTree) {
      return c.json({ nodes: [], count: 0 });
    }
    const nodes = delCtx.delegationTree.toArray();
    return c.json({ nodes, count: nodes.length });
  });

  app.get("/v1/delegations/:tokenId", (c) => {
    const tokenId = c.req.param("tokenId");

    if (!delCtx.delegationTree) {
      return c.json({ error: "Delegation tree not available" }, 503);
    }

    const node = delCtx.delegationTree.get(tokenId);
    if (!node) {
      return c.json({ error: `Token ${tokenId} not found in delegation tree` }, 404);
    }

    return c.json(node);
  });

  return app;
}
