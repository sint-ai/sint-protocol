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
import { CsmlEscalator } from "@sint/avatar";
import { RevocationStore } from "@sint/gate-capability-tokens";
import { PolicyGateway, ApprovalQueue } from "@sint/gate-policy-gateway";
import { LedgerWriter } from "@sint/gate-evidence-ledger";
import type { TokenStore, LedgerStore, CacheStore, RevocationBus } from "@sint/persistence";
import {
  InMemoryTokenStore,
  InMemoryLedgerStore,
  InMemoryCache,
  InMemoryRevocationBus,
  PgTokenStore,
  PgLedgerStore,
  getPool,
  ensurePgSchema,
  RedisCache,
  RedisRevocationBus,
} from "@sint/persistence";
import type { SintCapabilityToken, SintEventType } from "@sint/core";
import { createRedisClient } from "./redis-factory.js";
import { applyMiddleware } from "./middleware.js";
import { ed25519Auth, apiKeyAuth, rateLimit } from "./middleware/auth.js";
import { structuredLogging } from "./middleware/logging.js";
import { metricsMiddleware, metricsRoutes } from "./middleware/metrics.js";
import { healthRoutes } from "./routes/health.js";
import { interceptRoutes } from "./routes/intercept.js";
import { tokenRoutes } from "./routes/tokens.js";
import { ledgerRoutes } from "./routes/ledger.js";
import { approvalRoutes } from "./routes/approvals.js";
import { discoveryRoutes } from "./routes/discovery.js";
import { economyRoutes, type EconomyRouteContext } from "./routes/economy.js";
import { a2aRoutes, type A2ARouteContext } from "./routes/a2a.js";
import { riskStreamRoutes, globalRiskBus } from "./routes/risk-stream.js";
import { memoryRoutes, type MemoryRouteContext } from "./routes/memory.js";
import { delegationRoutes, type DelegationRouteContext } from "./routes/delegations.js";
import { csmlRoutes, type CsmlRouteContext } from "./routes/csml.js";
import { registryRoutes, type RegistryRouteContext } from "./routes/registry.js";
import { InMemoryRegistryStore } from "@sint/token-registry";
import type { SintConfig } from "./config.js";

/** Shared server state — injectable for testing. */
export interface ServerContext {
  readonly tokenStore: TokenStore;
  readonly revocationStore: RevocationStore;
  readonly ledger: LedgerWriter;
  readonly ledgerStore: LedgerStore;
  readonly gateway: PolicyGateway;
  readonly approvalQueue: ApprovalQueue;
  readonly cache: CacheStore;
  readonly revocationBus: RevocationBus;
  readonly registryStore: InMemoryRegistryStore;
  readonly backend: {
    readonly store: "memory" | "postgres";
    readonly cache: "memory" | "redis";
  };
  readonly readinessProbe: () => Promise<{
    ok: boolean;
    checks: {
      store: { ok: boolean; detail: string };
      cache: { ok: boolean; detail: string };
    };
  }>;
}

function createDefaultCsmlEscalator(ledger: LedgerWriter): CsmlEscalator {
  return new CsmlEscalator({
    queryEvents: async (agentId, windowSize) => {
      const byAgent = ledger.getAll().filter((event) => event.agentId === agentId);
      return byAgent.slice(Math.max(0, byAgent.length - windowSize));
    },
  });
}

/** Create a default server context with in-memory stores (testing/dev). */
export function createContext(): ServerContext {
  const tokenStore = new InMemoryTokenStore();
  const revocationStore = new RevocationStore();
  const ledgerStore = new InMemoryLedgerStore();
  const ledger = new LedgerWriter();
  const approvalQueue = new ApprovalQueue();
  const cache = new InMemoryCache();
  const revocationBus = new InMemoryRevocationBus();
  const registryStore = new InMemoryRegistryStore();

  const gateway = new PolicyGateway({
    resolveToken: async (id) => tokenStore.get(id),
    revocationStore,
    csmlEscalation: createDefaultCsmlEscalator(ledger),
    emitLedgerEvent: (event) => {
      const written = ledger.append({
        eventType: event.eventType as SintEventType,
        agentId: event.agentId,
        tokenId: event.tokenId,
        payload: event.payload,
      });
      // Also persist to backing store
      ledgerStore.append(written).catch((err) => {
        console.error("[SINT] Failed to persist ledger event:", err);
      });
    },
  });

  // Wire revocation bus → local store sync
  revocationBus.subscribe((event) => {
    revocationStore.revoke(event.tokenId, event.reason, event.revokedBy);
  });

  return {
    tokenStore,
    revocationStore,
    ledger,
    ledgerStore,
    gateway,
    approvalQueue,
    cache,
    revocationBus,
    registryStore,
    backend: { store: "memory", cache: "memory" },
    readinessProbe: async () => ({
      ok: true,
      checks: {
        store: { ok: true, detail: "in-memory store" },
        cache: { ok: true, detail: "in-memory cache" },
      },
    }),
  };
}

/**
 * Create a server context backed by PostgreSQL and optionally Redis.
 * Falls back to in-memory stores for any unconfigured backends.
 *
 * Redis integration:
 * - RedisCache: Distributed TTL cache for hot token lookups
 * - RedisRevocationBus: Pub/sub for <1s revocation propagation across nodes
 */
export async function createPersistentContext(config: SintConfig): Promise<ServerContext> {
  let tokenStore: TokenStore;
  let ledgerStore: LedgerStore;
  let cache: CacheStore;
  let revocationBus: RevocationBus;
  let storeProbe: () => Promise<{ ok: boolean; detail: string }> = async () => ({
    ok: true,
    detail: "in-memory store",
  });
  let cacheProbe: () => Promise<{ ok: boolean; detail: string }> = async () => ({
    ok: true,
    detail: "in-memory cache",
  });

  // ── Storage backend ──
  if (config.store === "postgres" && config.databaseUrl) {
    const pool = getPool({ connectionString: config.databaseUrl });
    await ensurePgSchema(pool);
    tokenStore = new PgTokenStore(pool);
    ledgerStore = new PgLedgerStore(pool);
    storeProbe = async () => {
      try {
        await pool.query("SELECT 1");
        return { ok: true, detail: "postgres reachable" };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, detail: `postgres probe failed: ${message}` };
      }
    };
    console.log("[SINT] PostgreSQL schema verified");
  } else {
    tokenStore = new InMemoryTokenStore();
    ledgerStore = new InMemoryLedgerStore();
  }

  // ── Cache + revocation bus backend ──
  if (config.cache === "redis" && config.redisUrl) {
    const redisPublisher = createRedisClient(config.redisUrl);
    const redisCacheClient = createRedisClient(config.redisUrl);
    // Fail-fast connectivity check so deploy issues surface at startup.
    await redisPublisher.ping();
    await redisCacheClient.ping();
    cache = new RedisCache(redisCacheClient);
    const redisUrl = config.redisUrl;
    revocationBus = new RedisRevocationBus(
      redisPublisher,
      () => createRedisClient(redisUrl), // Subscriber needs its own connection
    );
    cacheProbe = async () => {
      try {
        await redisCacheClient.ping();
        return { ok: true, detail: "redis reachable" };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, detail: `redis probe failed: ${message}` };
      }
    };
    console.log("[SINT] Redis cache + revocation bus connected");
  } else {
    cache = new InMemoryCache();
    revocationBus = new InMemoryRevocationBus();
  }

  const revocationStore = new RevocationStore();
  const ledger = new LedgerWriter();
  const approvalQueue = new ApprovalQueue();

  const gateway = new PolicyGateway({
    resolveToken: async (id) => {
      // Check cache first for hot token lookups
      const cached = await cache.get<SintCapabilityToken>(`token:${id}`);
      if (cached) return cached;
      const token = await tokenStore.get(id);
      if (token) {
        // Cache for 60s — tokens are validated every request anyway
        await cache.set(`token:${id}`, token, 60_000);
      }
      return token;
    },
    revocationStore,
    csmlEscalation: createDefaultCsmlEscalator(ledger),
    emitLedgerEvent: (event) => {
      const written = ledger.append({
        eventType: event.eventType as SintEventType,
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

  // Wire revocation bus: when any node revokes a token, all nodes update their local store
  revocationBus.subscribe((event) => {
    revocationStore.revoke(event.tokenId, event.reason, event.revokedBy);
    // Invalidate cached token on revocation
    cache.delete(`token:${event.tokenId}`).catch(() => {});
  });

  const registryStore = new InMemoryRegistryStore();

  return {
    tokenStore,
    revocationStore,
    ledger,
    ledgerStore,
    gateway,
    approvalQueue,
    cache,
    revocationBus,
    registryStore,
    backend: { store: config.store, cache: config.cache },
    readinessProbe: async () => {
      const [storeCheck, cacheCheck] = await Promise.all([storeProbe(), cacheProbe()]);
      return {
        ok: storeCheck.ok && cacheCheck.ok,
        checks: {
          store: storeCheck,
          cache: cacheCheck,
        },
      };
    },
  };
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
  /** Optional economy route context for balance/budget/trust endpoints. */
  economyContext?: EconomyRouteContext;
  /** Optional A2A route context — mounts /v1/a2a when configured. */
  a2aContext?: A2ARouteContext;
  /** Optional memory route context — mounts /v1/memory when configured. */
  memoryContext?: MemoryRouteContext;
  /** Optional delegation route context — mounts /v1/delegations when configured. */
  delegationContext?: DelegationRouteContext;
  /** Optional CSML route context — mounts /v1/csml when configured. */
  csmlContext?: CsmlRouteContext;
  /** Optional registry route context — mounts /v1/registry when configured. */
  registryContext?: RegistryRouteContext;
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
  app.route("", discoveryRoutes());
  app.route("", metricsRoutes());
  app.route("", riskStreamRoutes(context, globalRiskBus));

  // Economy routes (optional — only when economy context is configured)
  if (options.economyContext) {
    app.route("", economyRoutes(options.economyContext));
  }

  // A2A routes (optional — only when A2A context is configured)
  if (options.a2aContext) {
    app.route("", a2aRoutes(options.a2aContext));
  }

  // Memory routes (optional — only when memory bank is configured)
  if (options.memoryContext) {
    app.route("", memoryRoutes(options.memoryContext));
  }

  // Delegation routes (optional — only when delegation tree is configured)
  if (options.delegationContext) {
    app.route("", delegationRoutes(options.delegationContext));
  }

  // CSML routes (optional — requires server context for ledger access)
  if (options.csmlContext) {
    app.route("", csmlRoutes(options.csmlContext));
  }

  // Registry routes — always mount with default in-memory store from context
  app.route("/v1/registry", registryRoutes(options.registryContext ?? { registryStore: context.registryStore }));

  return app;
}
