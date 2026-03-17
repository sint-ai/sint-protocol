/**
 * SINT Gateway Server — Server factory.
 *
 * Creates a testable Hono app instance with all routes
 * and middleware configured. Supports in-memory and
 * persistent (PostgreSQL/Redis) storage backends.
 *
 * @module @sint/gateway-server/server
 */

import { Hono } from "hono";
import { RevocationStore } from "@sint/gate-capability-tokens";
import { PolicyGateway, ApprovalQueue } from "@sint/gate-policy-gateway";
import { LedgerWriter } from "@sint/gate-evidence-ledger";
import type { TokenStore, LedgerStore } from "@sint/persistence";
import {
  InMemoryTokenStore,
  InMemoryLedgerStore,
  PgTokenStore,
  PgLedgerStore,
  getPool,
} from "@sint/persistence";
import { applyMiddleware } from "./middleware.js";
import { ed25519Auth, apiKeyAuth, rateLimit } from "./middleware/auth.js";
import { structuredLogging } from "./middleware/logging.js";
import { metricsMiddleware, metricsRoutes } from "./middleware/metrics.js";
import { healthRoutes } from "./routes/health.js";
import { interceptRoutes } from "./routes/intercept.js";
import { tokenRoutes } from "./routes/tokens.js";
import { ledgerRoutes } from "./routes/ledger.js";
import { approvalRoutes } from "./routes/approvals.js";
import type { SintConfig } from "./config.js";

/** Shared server state — injectable for testing. */
export interface ServerContext {
  readonly tokenStore: TokenStore;
  readonly revocationStore: RevocationStore;
  readonly ledger: LedgerWriter;
  readonly ledgerStore: LedgerStore;
  readonly gateway: PolicyGateway;
  readonly approvalQueue: ApprovalQueue;
}

/** Create a default server context with in-memory stores (testing/dev). */
export function createContext(): ServerContext {
  const tokenStore = new InMemoryTokenStore();
  const revocationStore = new RevocationStore();
  const ledgerStore = new InMemoryLedgerStore();
  const ledger = new LedgerWriter();
  const approvalQueue = new ApprovalQueue();

  const gateway = new PolicyGateway({
    resolveToken: async (id) => tokenStore.get(id),
    revocationStore,
    emitLedgerEvent: (event) => {
      const written = ledger.append({
        eventType: event.eventType as any,
        agentId: event.agentId,
        tokenId: event.tokenId,
        payload: event.payload,
      });
      // Also persist to backing store (fire-and-forget)
      ledgerStore.append(written).catch(() => {});
    },
  });

  return { tokenStore, revocationStore, ledger, ledgerStore, gateway, approvalQueue };
}

/**
 * Create a server context backed by PostgreSQL and optionally Redis.
 * Falls back to in-memory stores for any unconfigured backends.
 */
export function createPersistentContext(config: SintConfig): ServerContext {
  let tokenStore: TokenStore;
  let ledgerStore: LedgerStore;

  if (config.store === "postgres" && config.databaseUrl) {
    const pool = getPool({ connectionString: config.databaseUrl });
    tokenStore = new PgTokenStore(pool);
    ledgerStore = new PgLedgerStore(pool);
  } else {
    tokenStore = new InMemoryTokenStore();
    ledgerStore = new InMemoryLedgerStore();
  }

  const revocationStore = new RevocationStore();
  const ledger = new LedgerWriter();
  const approvalQueue = new ApprovalQueue();

  const gateway = new PolicyGateway({
    resolveToken: async (id) => tokenStore.get(id),
    revocationStore,
    emitLedgerEvent: (event) => {
      const written = ledger.append({
        eventType: event.eventType as any,
        agentId: event.agentId,
        tokenId: event.tokenId,
        payload: event.payload,
      });
      // Persist to backing store (fire-and-forget for non-blocking operation)
      ledgerStore.append(written).catch((err) => {
        console.error("[SINT] Failed to persist ledger event:", err);
      });
    },
  });

  return { tokenStore, revocationStore, ledger, ledgerStore, gateway, approvalQueue };
}

/** Server configuration options. */
export interface ServerOptions {
  /** API key for admin endpoints. If unset, admin auth is disabled (dev mode). */
  apiKey?: string;
  /** Enable Ed25519 request signing on agent endpoints. Default: false. */
  requireSignatures?: boolean;
  /** Rate limit: max requests per window. Default: 100. */
  rateLimitMax?: number;
  /** Rate limit: window duration in ms. Default: 60000. */
  rateLimitWindowMs?: number;
}

/** Create a fully configured Hono app. */
export function createApp(ctx?: ServerContext, opts?: ServerOptions): Hono {
  const context = ctx ?? createContext();
  const options = opts ?? {};
  const app = new Hono();

  applyMiddleware(app);

  // Logging & metrics
  app.use("*", structuredLogging());
  app.use("*", metricsMiddleware());

  // Auth middleware (opt-in per config)
  if (options.requireSignatures) {
    app.use("*", ed25519Auth());
  }
  if (options.apiKey) {
    app.use("*", apiKeyAuth(options.apiKey));
  }
  app.use("*", rateLimit(options.rateLimitMax, options.rateLimitWindowMs));

  app.route("", healthRoutes(context));
  app.route("", interceptRoutes(context));
  app.route("", tokenRoutes(context));
  app.route("", ledgerRoutes(context));
  app.route("", approvalRoutes(context));
  app.route("", metricsRoutes());

  return app;
}
