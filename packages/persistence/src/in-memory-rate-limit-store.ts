/**
 * SINT Persistence — In-memory RateLimitStore.
 *
 * Sliding-window (fixed-bucket) call counter for per-token rate limiting.
 * Uses bucket keys of the form `sint:rate:<tokenId>:<bucketN>` which the
 * PolicyGateway constructs before calling increment().
 *
 * Suitable for single-node deployments and tests.
 * For distributed deployments use RedisRateLimitStore (see redis-cache.ts).
 *
 * @module @sint/persistence/in-memory-rate-limit-store
 */

import type { RateLimitStore } from "@pshkv/core";

/**
 * In-memory implementation of RateLimitStore.
 * Each bucket entry auto-expires after windowMs milliseconds.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly counters = new Map<string, { count: number; expiresAt: number }>();

  /** Increment a rate-limit key and return the new count. Resets after windowMs. */
  async increment(key: string, windowMs: number): Promise<number> {
    this.evict();
    const existing = this.counters.get(key);
    if (existing && existing.expiresAt > Date.now()) {
      existing.count += 1;
      return existing.count;
    }
    this.counters.set(key, { count: 1, expiresAt: Date.now() + windowMs });
    return 1;
  }

  /** Return the current count for a key (0 if absent or expired). */
  async getCount(key: string): Promise<number> {
    this.evict();
    const entry = this.counters.get(key);
    if (!entry || entry.expiresAt <= Date.now()) return 0;
    return entry.count;
  }

  /** Remove all expired entries. */
  private evict(): void {
    const now = Date.now();
    for (const [key, entry] of this.counters) {
      if (entry.expiresAt <= now) this.counters.delete(key);
    }
  }

  /** Reset all counters (for tests). */
  clear(): void {
    this.counters.clear();
  }

  /** Number of active (non-expired) keys. */
  get size(): number {
    this.evict();
    return this.counters.size;
  }
}
