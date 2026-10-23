/**
 * SINT Persistence — Redis Cache Store.
 *
 * TTL-based caching using Redis for distributed cache.
 *
 * @module @sint/persistence/redis-cache
 */

import type { Redis } from "ioredis";
import type { CacheStore } from "./interfaces.js";

const KEY_PREFIX = "sint:cache:";

export class RedisCache implements CacheStore {
  private readonly keyPrefix: string;

  /** Optional namespace isolates cache operations, including clear(). */
  constructor(private readonly redis: Redis, namespace?: string) {
    // Length framing keeps "a" separate from "a:child" during prefix clears.
    this.keyPrefix = namespace ? `${KEY_PREFIX}${namespace.length}:${namespace}:` : KEY_PREFIX;
  }

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.redis.get(this.keyPrefix + key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    await this.redis.set(
      this.keyPrefix + key,
      JSON.stringify(value),
      "PX",
      ttlMs,
    );
  }

  async delete(key: string): Promise<boolean> {
    const count = await this.redis.del(this.keyPrefix + key);
    return count > 0;
  }

  async has(key: string): Promise<boolean> {
    const exists = await this.redis.exists(this.keyPrefix + key);
    return exists > 0;
  }

  async clear(): Promise<void> {
    // Redis KEYS accepts a glob; configured namespaces must be literal.
    const literalPrefix = this.keyPrefix.replace(/[\\*?\[\]]/g, "\\$&");
    const keys = await this.redis.keys(literalPrefix + "*");
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
