/**
 * SINT Persistence Postgres — PostgreSQL Rate Limit Store.
 *
 * Implements the RateLimitStore interface from @sint/core using PostgreSQL.
 * Uses UPSERT (INSERT … ON CONFLICT DO UPDATE) for atomic counter increments.
 *
 * Suitable for multi-node deployments where in-memory counters would diverge.
 *
 * Table: sint_rate_limit_counters
 *   bucket_key   TEXT PRIMARY KEY
 *   count        BIGINT NOT NULL DEFAULT 1
 *   expires_at   TIMESTAMPTZ NOT NULL
 *
 * @module @sint/persistence-postgres/pg-rate-limit-store
 */

import type { RateLimitStore } from "@sint-ai/core";
import type { PgPool } from "./pg-pool.js";

/**
 * PostgreSQL-backed RateLimitStore.
 *
 * Counters are keyed by the same bucket-key convention used by PolicyGateway:
 * `sint:rate:<tokenId>:<windowBucketMs>`
 *
 * Expired buckets are not proactively GC'd — a background job or pg cron can
 * periodically run:
 *   DELETE FROM sint_rate_limit_counters WHERE expires_at < now();
 */
export class PgRateLimitStore implements RateLimitStore {
  constructor(private readonly pool: PgPool) {}

  /**
   * Atomically increment the counter for `key`, creating it if absent.
   * If the existing bucket has expired, it is reset to 1.
   *
   * @param key       - Bucket key (e.g. `sint:rate:<tokenId>:<bucket>`)
   * @param windowMs  - Window duration; used to compute `expires_at` on creation
   * @returns The new counter value after increment.
   */
  async increment(key: string, windowMs: number): Promise<number> {
    const expiresAt = new Date(Date.now() + windowMs).toISOString();

    const result = await this.pool.query(
      `INSERT INTO sint_rate_limit_counters (bucket_key, count, expires_at)
       VALUES ($1, 1, $2::timestamptz)
       ON CONFLICT (bucket_key) DO UPDATE SET
         count = CASE
           WHEN sint_rate_limit_counters.expires_at < now() THEN 1
           ELSE sint_rate_limit_counters.count + 1
         END,
         expires_at = CASE
           WHEN sint_rate_limit_counters.expires_at < now() THEN $2::timestamptz
           ELSE sint_rate_limit_counters.expires_at
         END
       RETURNING count`,
      [key, expiresAt],
    );

    const row = result.rows[0] as Record<string, unknown> | undefined;
    return parseInt(String(row?.["count"] ?? "1"), 10);
  }

  /**
   * Return the current counter value for `key`.
   * Returns 0 if the key does not exist or has expired.
   */
  async getCount(key: string): Promise<number> {
    const result = await this.pool.query(
      `SELECT count FROM sint_rate_limit_counters
       WHERE bucket_key = $1 AND expires_at >= now()`,
      [key],
    );

    if (result.rows.length === 0) return 0;
    const row = result.rows[0] as Record<string, unknown>;
    return parseInt(String(row["count"] ?? "0"), 10);
  }
}
