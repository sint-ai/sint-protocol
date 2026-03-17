/**
 * SINT Persistence — In-Memory Cache Store.
 *
 * @module @sint/persistence/in-memory-cache
 */

import type { CacheStore } from "./interfaces.js";

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class InMemoryCache implements CacheStore {
  private entries = new Map<string, CacheEntry<unknown>>();

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.entries.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlMs: number): Promise<void> {
    this.entries.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  async delete(key: string): Promise<boolean> {
    return this.entries.delete(key);
  }

  async has(key: string): Promise<boolean> {
    const entry = this.entries.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.entries.delete(key);
      return false;
    }

    return true;
  }

  async clear(): Promise<void> {
    this.entries.clear();
  }
}
