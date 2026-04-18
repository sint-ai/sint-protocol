/**
 * SINT Persistence — Interface contract tests.
 *
 * Tests the in-memory implementations to verify they satisfy
 * the storage contracts. Any adapter (PG, Redis) must pass
 * equivalent tests.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { InMemoryLedgerStore } from "../src/in-memory-ledger-store.js";
import { InMemoryTokenStore } from "../src/in-memory-token-store.js";
import { InMemoryCache } from "../src/in-memory-cache.js";
import { InMemoryRevocationBus } from "../src/in-memory-revocation-bus.js";
import type { SintLedgerEvent, SintCapabilityToken } from "@sint-ai/core";

function makeLedgerEvent(
  seq: number,
  overrides?: Partial<SintLedgerEvent>,
): SintLedgerEvent {
  return {
    eventId: `01905f7c-${String(seq).padStart(4, "0")}-7000-8000-000000000000`,
    sequenceNumber: BigInt(seq),
    timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    eventType: "policy.evaluated",
    agentId: "a".repeat(64),
    payload: { decision: "allow" },
    previousHash: "0".repeat(64),
    hash: `${String(seq).padStart(2, "0")}${"f".repeat(62)}`,
    ...overrides,
  } as SintLedgerEvent;
}

function makeToken(id: string): SintCapabilityToken {
  return {
    tokenId: id,
    version: "1.0.0",
    issuer: "a".repeat(64),
    subject: "b".repeat(64),
    resource: "ros2:///cmd_vel",
    actions: ["publish"],
    constraints: {},
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    revocable: true,
    signature: "c".repeat(128),
  } as SintCapabilityToken;
}

// ── LedgerStore ──

describe("InMemoryLedgerStore", () => {
  let store: InMemoryLedgerStore;

  beforeEach(() => {
    store = new InMemoryLedgerStore();
  });

  it("append and getById", async () => {
    const event = makeLedgerEvent(1);
    await store.append(event);

    const found = await store.getById(event.eventId);
    expect(found).toBeDefined();
    expect(found!.eventId).toBe(event.eventId);
  });

  it("getHead returns latest event", async () => {
    await store.append(makeLedgerEvent(1));
    await store.append(makeLedgerEvent(2));
    await store.append(makeLedgerEvent(3));

    const head = await store.getHead();
    expect(head!.sequenceNumber).toBe(3n);
  });

  it("getHead returns undefined for empty store", async () => {
    const head = await store.getHead();
    expect(head).toBeUndefined();
  });

  it("count tracks number of events", async () => {
    expect(await store.count()).toBe(0);
    await store.append(makeLedgerEvent(1));
    await store.append(makeLedgerEvent(2));
    expect(await store.count()).toBe(2);
  });

  it("query filters by agentId", async () => {
    await store.append(makeLedgerEvent(1, { agentId: "a".repeat(64) }));
    await store.append(makeLedgerEvent(2, { agentId: "b".repeat(64) }));

    const results = await store.query({ agentId: "a".repeat(64) });
    expect(results).toHaveLength(1);
  });

  it("query filters by eventType", async () => {
    await store.append(makeLedgerEvent(1, { eventType: "policy.evaluated" }));
    await store.append(makeLedgerEvent(2, { eventType: "action.completed" }));

    const results = await store.query({ eventType: "policy.evaluated" });
    expect(results).toHaveLength(1);
  });

  it("query filters by sequence range", async () => {
    await store.append(makeLedgerEvent(1));
    await store.append(makeLedgerEvent(2));
    await store.append(makeLedgerEvent(3));
    await store.append(makeLedgerEvent(4));

    const results = await store.query({ fromSequence: 2n, toSequence: 3n });
    expect(results).toHaveLength(2);
  });

  it("query supports limit and offset", async () => {
    for (let i = 1; i <= 5; i++) {
      await store.append(makeLedgerEvent(i));
    }

    const results = await store.query({ limit: 2, offset: 1 });
    expect(results).toHaveLength(2);
    expect(results[0]!.sequenceNumber).toBe(2n);
  });

  it("verifyChain returns true for valid chain", async () => {
    const e1 = makeLedgerEvent(1, { previousHash: "0".repeat(64), hash: "a".repeat(64) });
    const e2 = makeLedgerEvent(2, { previousHash: "a".repeat(64), hash: "b".repeat(64) });
    const e3 = makeLedgerEvent(3, { previousHash: "b".repeat(64), hash: "c".repeat(64) });

    await store.append(e1);
    await store.append(e2);
    await store.append(e3);

    expect(await store.verifyChain()).toBe(true);
  });

  it("verifyChain returns false for broken chain", async () => {
    const e1 = makeLedgerEvent(1, { previousHash: "0".repeat(64), hash: "a".repeat(64) });
    const e2 = makeLedgerEvent(2, { previousHash: "x".repeat(64), hash: "b".repeat(64) });

    await store.append(e1);
    await store.append(e2);

    expect(await store.verifyChain()).toBe(false);
  });

  it("verifyChain returns true for empty store", async () => {
    expect(await store.verifyChain()).toBe(true);
  });
});

// ── TokenStore ──

describe("InMemoryTokenStore", () => {
  let store: InMemoryTokenStore;

  beforeEach(() => {
    store = new InMemoryTokenStore();
  });

  it("store and get", async () => {
    const token = makeToken("token-1");
    await store.store(token);

    const found = await store.get("token-1");
    expect(found).toBeDefined();
    expect(found!.tokenId).toBe("token-1");
  });

  it("get returns undefined for unknown token", async () => {
    const found = await store.get("unknown");
    expect(found).toBeUndefined();
  });

  it("getBySubject returns all tokens for subject", async () => {
    await store.store(makeToken("t1"));
    await store.store({ ...makeToken("t2"), subject: "d".repeat(64) } as SintCapabilityToken);
    await store.store(makeToken("t3"));

    const results = await store.getBySubject("b".repeat(64));
    expect(results).toHaveLength(2);
  });

  it("remove deletes a token", async () => {
    await store.store(makeToken("t1"));
    expect(await store.count()).toBe(1);

    const removed = await store.remove("t1");
    expect(removed).toBe(true);
    expect(await store.count()).toBe(0);
  });

  it("remove returns false for unknown token", async () => {
    const removed = await store.remove("unknown");
    expect(removed).toBe(false);
  });
});

// ── CacheStore ──

describe("InMemoryCache", () => {
  let cache: InMemoryCache;

  beforeEach(() => {
    cache = new InMemoryCache();
  });

  it("set and get", async () => {
    await cache.set("key1", { data: "hello" }, 60_000);
    const value = await cache.get<{ data: string }>("key1");
    expect(value).toEqual({ data: "hello" });
  });

  it("get returns undefined for missing key", async () => {
    const value = await cache.get("missing");
    expect(value).toBeUndefined();
  });

  it("get returns undefined for expired key", async () => {
    vi.useFakeTimers();
    await cache.set("key1", "value", 100);

    vi.advanceTimersByTime(101);

    const value = await cache.get("key1");
    expect(value).toBeUndefined();
    vi.useRealTimers();
  });

  it("has returns true for existing key", async () => {
    await cache.set("key1", "value", 60_000);
    expect(await cache.has("key1")).toBe(true);
  });

  it("has returns false for expired key", async () => {
    vi.useFakeTimers();
    await cache.set("key1", "value", 100);

    vi.advanceTimersByTime(101);

    expect(await cache.has("key1")).toBe(false);
    vi.useRealTimers();
  });

  it("delete removes a key", async () => {
    await cache.set("key1", "value", 60_000);
    const deleted = await cache.delete("key1");
    expect(deleted).toBe(true);
    expect(await cache.has("key1")).toBe(false);
  });

  it("clear removes all keys", async () => {
    await cache.set("k1", "v1", 60_000);
    await cache.set("k2", "v2", 60_000);
    await cache.clear();

    expect(await cache.has("k1")).toBe(false);
    expect(await cache.has("k2")).toBe(false);
  });
});

// ── RevocationBus ──

describe("InMemoryRevocationBus", () => {
  it("publishes events to subscribers", async () => {
    const bus = new InMemoryRevocationBus();
    const events: unknown[] = [];

    bus.subscribe((e) => events.push(e));
    await bus.publish("token-1", "compromised", "admin");

    expect(events).toHaveLength(1);
    expect((events[0] as any).tokenId).toBe("token-1");
    expect((events[0] as any).reason).toBe("compromised");
  });

  it("unsubscribe removes handler", async () => {
    const bus = new InMemoryRevocationBus();
    const events: unknown[] = [];

    const unsub = bus.subscribe((e) => events.push(e));
    await bus.publish("token-1", "r1", "admin");
    expect(events).toHaveLength(1);

    unsub();
    await bus.publish("token-2", "r2", "admin");
    expect(events).toHaveLength(1);
  });

  it("supports multiple subscribers", async () => {
    const bus = new InMemoryRevocationBus();
    const events1: unknown[] = [];
    const events2: unknown[] = [];

    bus.subscribe((e) => events1.push(e));
    bus.subscribe((e) => events2.push(e));

    await bus.publish("token-1", "reason", "admin");

    expect(events1).toHaveLength(1);
    expect(events2).toHaveLength(1);
  });
});
