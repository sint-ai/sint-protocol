/**
 * SINT Gateway Server — Configuration.
 *
 * Environment-based configuration for storage backends,
 * authentication, and server settings.
 *
 * @module @sint/gateway-server/config
 */

export interface SintConfig {
  /** Runtime mode. Production mode enforces secure storage and auth defaults. */
  env: "development" | "test" | "production";
  /** Server port. Default: 3100. */
  port: number;
  /** Storage backend: "memory" | "postgres". Default: "memory". */
  store: "memory" | "postgres";
  /** Cache backend: "memory" | "redis". Default: "memory". */
  cache: "memory" | "redis";
  /** PostgreSQL connection string. Required when store=postgres. */
  databaseUrl?: string;
  /** Redis connection string. Required when cache=redis. */
  redisUrl?: string;
  /** Admin API key. If unset, admin auth is disabled (dev mode). */
  apiKey?: string;
  /** Enable Ed25519 request signing. Default: false. */
  requireSignatures: boolean;
  /** Rate limit: max requests per minute. Default: 100. */
  rateLimitMax: number;
  /** Allow WebSocket API key auth via ?apiKey= query param. Default: true. */
  wsAllowQueryApiKey: boolean;
}

function parsePositiveInt(name: string, raw: string, fallback?: number): number {
  const value = raw === "" && fallback !== undefined ? fallback : Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

function parseBoolean(name: string, raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new Error(`${name} must be "true" or "false"`);
}

/** Load configuration from environment variables. */
export function loadConfig(): SintConfig {
  const env = (process.env.SINT_ENV ?? process.env.NODE_ENV ?? "development") as SintConfig["env"];
  if (env !== "development" && env !== "test" && env !== "production") {
    throw new Error(`Invalid SINT_ENV/NODE_ENV: "${env}" (expected "development", "test", or "production")`);
  }

  const store = (process.env.SINT_STORE ?? "memory") as "memory" | "postgres";
  const cache = (process.env.SINT_CACHE ?? "memory") as "memory" | "redis";

  if (store !== "memory" && store !== "postgres") {
    throw new Error(`Invalid SINT_STORE: "${store}" (expected "memory" or "postgres")`);
  }
  if (cache !== "memory" && cache !== "redis") {
    throw new Error(`Invalid SINT_CACHE: "${cache}" (expected "memory" or "redis")`);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (store === "postgres" && !databaseUrl) {
    throw new Error("DATABASE_URL is required when SINT_STORE=postgres");
  }

  const redisUrl = process.env.REDIS_URL;
  if (cache === "redis" && !redisUrl) {
    throw new Error("REDIS_URL is required when SINT_CACHE=redis");
  }

  const apiKey = process.env.SINT_API_KEY;
  const requireSignatures = parseBoolean(
    "SINT_REQUIRE_SIGNATURES",
    process.env.SINT_REQUIRE_SIGNATURES,
    false,
  );
  const wsAllowQueryApiKey = parseBoolean(
    "SINT_WS_ALLOW_QUERY_API_KEY",
    process.env.SINT_WS_ALLOW_QUERY_API_KEY,
    true,
  );

  if (env === "production") {
    if (store !== "postgres") {
      throw new Error("SINT_STORE=postgres is required when SINT_ENV/NODE_ENV=production");
    }
    if (cache !== "redis") {
      throw new Error("SINT_CACHE=redis is required when SINT_ENV/NODE_ENV=production");
    }
    if (!apiKey) {
      throw new Error("SINT_API_KEY is required when SINT_ENV/NODE_ENV=production");
    }
    if (!requireSignatures) {
      throw new Error("SINT_REQUIRE_SIGNATURES=true is required when SINT_ENV/NODE_ENV=production");
    }
    if (wsAllowQueryApiKey) {
      throw new Error("SINT_WS_ALLOW_QUERY_API_KEY=false is required when SINT_ENV/NODE_ENV=production");
    }
  }

  return {
    env,
    port: parsePositiveInt("SINT_PORT", process.env.SINT_PORT ?? "3100"),
    store,
    cache,
    databaseUrl,
    redisUrl,
    apiKey,
    requireSignatures,
    rateLimitMax: parsePositiveInt("SINT_RATE_LIMIT", process.env.SINT_RATE_LIMIT ?? "100"),
    wsAllowQueryApiKey,
  };
}
