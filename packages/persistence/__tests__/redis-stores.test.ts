/** Real Redis contract tests; required CI execution rejects skipped cases. */
import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Redis from "ioredis";
import { RedisCache } from "../src/redis-cache.js";
import { RedisRevocationBus } from "../src/redis-revocation-bus.js";

const REDIS_URL = process.env.REDIS_URL;
const describeWithRedis = REDIS_URL ? describe : describe.skip;
const namespace = () => `integration_${randomBytes(12).toString("hex")}`;
const client = () => new Redis(REDIS_URL!, { connectTimeout: 2000, maxRetriesPerRequest: 1, retryStrategy: () => null });

describeWithRedis("RedisCache", () => {
  let redis: Redis;
  let cache: RedisCache;
  let caches: RedisCache[];
  beforeEach(async () => {
    redis = client();
    await redis.ping();
    cache = new RedisCache(redis, namespace());
    caches = [cache];
  });
  afterEach(async () => {
    if (redis) await Promise.all((caches ?? []).map(entry => entry.clear())).finally(() => redis.disconnect());
  });
  it("set and get", async () => {
    await cache.set("key1", { value: 42 }, 60000);
    expect(await cache.get("key1")).toEqual({ value: 42 });
  });
  it("get returns undefined on miss", async () => {
    expect(await cache.get("nonexistent")).toBeUndefined();
  });
  it("has returns true for existing key", async () => {
    await cache.set("key1", "value", 60000);
    expect(await cache.has("key1")).toBe(true);
    expect(await cache.has("nonexistent")).toBe(false);
  });
  it("delete removes key", async () => {
    await cache.set("key1", "value", 60000);
    expect(await cache.delete("key1")).toBe(true);
    expect(await cache.get("key1")).toBeUndefined();
  });
  it("TTL expiration works", async () => {
    await cache.set("key1", "value", 100);
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(await cache.get("key1")).toBeUndefined();
  });
  it.each(["plain", "nested", "glob"])("clear preserves neighboring namespaces (%s)", async kind => {
    const prefix = namespace();
    const own = new RedisCache(redis, kind === "glob" ? `${prefix}[*]?\\` : prefix);
    const neighbor = new RedisCache(redis, kind === "nested" ? `${prefix}:child` : `${prefix}-neighbor`);
    caches.push(own, neighbor);
    await own.set("same-key", "owned", 60000);
    await neighbor.set("same-key", "sentinel", 60000);
    await own.clear();
    expect(await own.get("same-key")).toBeUndefined();
    expect(await neighbor.get("same-key")).toBe("sentinel");
  });
});

describeWithRedis("RedisRevocationBus", () => {
  let publisher: Redis;
  let bus: RedisRevocationBus;
  let buses: RedisRevocationBus[];
  async function isolatedBus(): Promise<RedisRevocationBus> {
    const scope = namespace();
    const instance = new RedisRevocationBus(publisher, client, scope);
    buses.push(instance);
    const channel = `sint:revocations:${scope}`;
    // The server's subscription acknowledgement replaces a timing guess.
    await vi.waitFor(async () => {
      expect(await publisher.pubsub("NUMSUB", channel)).toEqual([channel, 1]);
    }, { timeout: 3000 });
    return instance;
  }
  beforeEach(async () => {
    publisher = client();
    buses = [];
    bus = await isolatedBus();
  });
  afterEach(async () => {
    if (publisher) await Promise.all(buses.map(entry => entry.dispose())).finally(() => publisher.disconnect());
  });
  it("publish and subscribe", async () => {
    const received = vi.fn();
    bus.subscribe(received);
    await bus.publish("tok-1", "test revocation", "admin");
    await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(1));
    expect(received.mock.calls[0]![0]).toMatchObject({ tokenId: "tok-1", reason: "test revocation" });
  });
  it("multiple subscribers receive events", async () => {
    const first = vi.fn();
    const second = vi.fn();
    bus.subscribe(first); bus.subscribe(second);
    await bus.publish("tok-2", "dual sub test", "system");
    await vi.waitFor(() => {
      expect(first).toHaveBeenCalledTimes(1);
      expect(second).toHaveBeenCalledTimes(1);
    });
  });
  it("unsubscribe stops events after delivery to a remaining observer", async () => {
    const received = vi.fn();
    const unsubscribe = bus.subscribe(received);
    await bus.publish("tok-3", "before unsub", "system");
    await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(1));
    unsubscribe();
    const observer = vi.fn();
    bus.subscribe(observer);
    await bus.publish("tok-4", "after unsub", "system");
    await vi.waitFor(() => expect(observer).toHaveBeenCalledTimes(1));
    expect(received).toHaveBeenCalledTimes(1);
  });
  it("revocation event includes timestamp", async () => {
    const received = vi.fn();
    bus.subscribe(received);
    await bus.publish("tok-5", "timestamp test", "admin");
    await vi.waitFor(() => expect(received).toHaveBeenCalledTimes(1));
    const event = received.mock.calls[0]![0];
    expect(event.revokedBy).toBe("admin");
    expect(Number.isFinite(Date.parse(event.timestamp))).toBe(true);
  });
  it("does not deliver revocations across namespaces", async () => {
    const other = await isolatedBus();
    const first = vi.fn();
    const second = vi.fn();
    bus.subscribe(first); other.subscribe(second);
    await bus.publish("tok-own", "own", "system");
    await vi.waitFor(() => expect(first).toHaveBeenCalledTimes(1));
    expect(second).not.toHaveBeenCalled();
    await other.publish("tok-other", "other", "system");
    await vi.waitFor(() => expect(second).toHaveBeenCalledTimes(1));
    expect(first).toHaveBeenCalledTimes(1);
  });
});
