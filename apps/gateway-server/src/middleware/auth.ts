/**
 * SINT Gateway Server — Authentication Middleware.
 *
 * - Ed25519 request signing for agent endpoints
 * - API key authentication for admin endpoints
 * - Per-key rate limiting
 *
 * @module @sint/gateway-server/middleware/auth
 */

import type { Context, Next } from "hono";
import { verify } from "@sint/gate-capability-tokens";

/** Paths exempt from all authentication. */
const EXEMPT_PATHS = new Set([
  "/v1/health",
  "/v1/keypair",
  "/.well-known/sint.json",
  "/v1/openapi.json",
  "/v1/schemas",
]);

/** Paths that require admin API key (not agent signature). */
const ADMIN_PATHS = [
  "/v1/tokens",
  "/v1/tokens/revoke",
  "/v1/ledger",
  "/v1/approvals",
];

/** Rate limit state per key. */
interface RateBucket {
  count: number;
  resetAt: number;
}

const rateBuckets = new Map<string, RateBucket>();

/**
 * Verify Ed25519-Signature header.
 *
 * Header format: `<publicKeyHex>:<signatureHex>`
 * The agent signs the raw JSON request body with their private key.
 */
export function ed25519Auth() {
  return async (c: Context, next: Next) => {
    const path = new URL(c.req.url).pathname;

    // Skip exempt paths
    if (EXEMPT_PATHS.has(path)) return next();

    // Skip if admin path (handled by apiKeyAuth)
    if (ADMIN_PATHS.some((p) => path.startsWith(p))) return next();

    // Only enforce on POST/PUT/PATCH (read-only GETs are exempt within non-admin routes)
    if (!["POST", "PUT", "PATCH"].includes(c.req.method)) return next();

    const sigHeader = c.req.header("Ed25519-Signature");
    if (!sigHeader) {
      return c.json({ error: "Missing Ed25519-Signature header" }, 401);
    }

    const colonIndex = sigHeader.indexOf(":");
    if (colonIndex === -1) {
      return c.json({ error: "Invalid Ed25519-Signature format (expected publicKey:signature)" }, 401);
    }

    const publicKey = sigHeader.slice(0, colonIndex);
    const signature = sigHeader.slice(colonIndex + 1);

    if (publicKey.length !== 64 || signature.length !== 128) {
      return c.json({ error: "Invalid Ed25519-Signature key/signature length" }, 401);
    }

    // Read body for verification
    const body = await c.req.text();

    const valid = verify(publicKey, signature, body);
    if (!valid) {
      return c.json({ error: "Invalid Ed25519 signature" }, 401);
    }

    // Store verified public key for downstream use
    c.set("authenticatedAgent", publicKey);

    await next();
  };
}

/**
 * API key authentication for admin endpoints.
 *
 * Header: `X-API-Key: <key>`
 * Key is validated against `SINT_API_KEY` environment variable.
 */
export function apiKeyAuth(apiKey?: string) {
  return async (c: Context, next: Next) => {
    const path = new URL(c.req.url).pathname;

    // Only enforce on admin paths
    if (!ADMIN_PATHS.some((p) => path.startsWith(p))) return next();

    // Skip exempt paths
    if (EXEMPT_PATHS.has(path)) return next();

    // If no API key configured, skip auth (dev mode)
    if (!apiKey) return next();

    const providedKey = c.req.header("X-API-Key");
    if (!providedKey) {
      return c.json({ error: "Missing X-API-Key header" }, 401);
    }

    if (providedKey !== apiKey) {
      return c.json({ error: "Invalid API key" }, 403);
    }

    await next();
  };
}

/**
 * Rate limiting per API key or IP.
 *
 * @param maxRequests Maximum requests per window (default: 100)
 * @param windowMs Window duration in milliseconds (default: 60_000 = 1 minute)
 */
export function rateLimit(maxRequests = 100, windowMs = 60_000) {
  return async (c: Context, next: Next) => {
    const key =
      c.req.header("X-API-Key") ??
      c.req.header("Ed25519-Signature")?.slice(0, 64) ??
      c.req.header("x-forwarded-for") ??
      "anonymous";

    const now = Date.now();
    let bucket = rateBuckets.get(key);

    if (!bucket || now >= bucket.resetAt) {
      bucket = { count: 0, resetAt: now + windowMs };
      rateBuckets.set(key, bucket);
    }

    bucket.count++;

    c.header("X-RateLimit-Limit", String(maxRequests));
    c.header("X-RateLimit-Remaining", String(Math.max(0, maxRequests - bucket.count)));
    c.header("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > maxRequests) {
      return c.json({ error: "Rate limit exceeded" }, 429);
    }

    await next();
  };
}

/** Clear rate limit state (for testing). */
export function clearRateLimits(): void {
  rateBuckets.clear();
}
