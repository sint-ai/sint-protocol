/**
 * SINT Gateway Server — Configuration.
 *
 * Environment-based configuration for storage backends,
 * authentication, and server settings.
 *
 * @module @sint/gateway-server/config
 */

export interface SintConfig {
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

/** Load configuration from environment variables. */
export function loadConfig(): SintConfig {
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

  return {
    port: parseInt(process.env.SINT_PORT ?? "3100", 10),
    store,
    cache,
    databaseUrl,
    redisUrl,
    apiKey: process.env.SINT_API_KEY,
    requireSignatures: process.env.SINT_REQUIRE_SIGNATURES === "true",
    rateLimitMax: parseInt(process.env.SINT_RATE_LIMIT ?? "100", 10),
    wsAllowQueryApiKey: process.env.SINT_WS_ALLOW_QUERY_API_KEY !== "false",
  };
}
