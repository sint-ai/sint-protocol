/**
 * SINT Gateway Server — Server factory.
 *
 * Creates a testable Hono app instance with all routes
 * and middleware configured.
 *
 * @module @sint/gateway-server/server
 */

import { Hono } from "hono";
import type { SintCapabilityToken } from "@sint/core";
import { RevocationStore } from "@sint/gate-capability-tokens";
import { PolicyGateway } from "@sint/gate-policy-gateway";
import { LedgerWriter } from "@sint/gate-evidence-ledger";
import { applyMiddleware } from "./middleware.js";
import { healthRoutes } from "./routes/health.js";
import { interceptRoutes } from "./routes/intercept.js";
import { tokenRoutes } from "./routes/tokens.js";
import { ledgerRoutes } from "./routes/ledger.js";

/** Shared server state — injectable for testing. */
export interface ServerContext {
  readonly tokenStore: Map<string, SintCapabilityToken>;
  readonly revocationStore: RevocationStore;
  readonly ledger: LedgerWriter;
  readonly gateway: PolicyGateway;
}

/** Create a default server context with in-memory stores. */
export function createContext(): ServerContext {
  const tokenStore = new Map<string, SintCapabilityToken>();
  const revocationStore = new RevocationStore();
  const ledger = new LedgerWriter();

  const gateway = new PolicyGateway({
    resolveToken: (id) => tokenStore.get(id),
    revocationStore,
    emitLedgerEvent: (event) => {
      ledger.append({
        eventType: event.eventType as any,
        agentId: event.agentId,
        tokenId: event.tokenId,
        payload: event.payload,
      });
    },
  });

  return { tokenStore, revocationStore, ledger, gateway };
}

/** Create a fully configured Hono app. */
export function createApp(ctx?: ServerContext): Hono {
  const context = ctx ?? createContext();
  const app = new Hono();

  applyMiddleware(app);
  app.route("", healthRoutes(context));
  app.route("", interceptRoutes(context));
  app.route("", tokenRoutes(context));
  app.route("", ledgerRoutes(context));

  return app;
}
