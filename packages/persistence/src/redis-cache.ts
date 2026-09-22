/**
 * SINT Persistence — Redis Cache Store.
 *
 * TTL-based caching using Redis for distributed cache.
 *
 * @module @pshkv/persistence/redis-cache
 */

import type { Redis } from "ioredis";
import type { CacheStore } from "./interfaces.js";

const KEY_PREFIX = "sint:cache:";

export class RedisCache implements CacheStore {
  constructor(private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.redis.get(KEY_PREFIX + key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    await this.redis.set(
      KEY_PREFIX + key,
      JSON.stringify(value),
      "PX",
      ttlMs,
    );
  }

  async delete(key: string): Promise<boolean> {
    const count = await this.redis.del(KEY_PREFIX + key);
    return count > 0;
  }

  async has(key: string): Promise<boolean> {
    const exists = await this.redis.exists(KEY_PREFIX + key);
    return exists > 0;
  }

  async clear(): Promise<void> {
    const keys = await this.redis.keys(KEY_PREFIX + "*");
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
