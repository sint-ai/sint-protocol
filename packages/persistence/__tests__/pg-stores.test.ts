/**
 * SINT Persistence — PostgreSQL Store tests.
 *
 * These tests require a running PostgreSQL instance.
 * Set DATABASE_URL env var to run them.
 * They are automatically skipped in CI without a database.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import pg from "pg";
import { PgLedgerStore } from "../src/pg-ledger-store.js";
import { PgTokenStore } from "../src/pg-token-store.js";
import type { SintLedgerEvent, SintCapabilityToken } from "@pshkv/core";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATABASE_URL = process.env.DATABASE_URL;

const describeWithPg = DATABASE_URL ? describe : describe.skip;

function makeLedgerEvent(seq: number, overrides?: Partial<SintLedgerEvent>): SintLedgerEvent {
  return {
    eventId: `event-${seq}`,
    sequenceNumber: BigInt(seq),
    timestamp: `2026-03-16T10:00:0${seq}.000000Z`,
    eventType: "request.received",
    agentId: "agent-pub-key-hex",
    payload: { test: true },
    previousHash: seq === 0 ? "0".repeat(64) : `hash-${seq - 1}`,
    hash: `hash-${seq}`,
    ...overrides,
  } as SintLedgerEvent;
}

function makeToken(id: string): SintCapabilityToken {
  return {
    tokenId: id,
    issuer: "issuer-pub-key",
    subject: "subject-pub-key",
    resource: "ros2:///camera/front",
    actions: ["subscribe"],
    constraints: {},
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    issuedAt: "2026-03-16T10:00:00.000000Z",
    expiresAt: "2026-03-16T22:00:00.000000Z",
    revocable: true,
    signature: "sig-" + id,
  } as SintCapabilityToken;
}

describeWithPg("PgLedgerStore", () => {
  let pool: pg.Pool;
  let store: PgLedgerStore;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const migrationSql = readFileSync(
      join(__dirname, "../migrations/001_create_ledger.sql"),
      "utf-8",
    );
    await pool.query(migrationSql);
    store = new PgLedgerStore(pool);
  });

  afterAll(async () => {
    await pool.query("DROP TABLE IF EXISTS sint_ledger_events");
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM sint_ledger_events");
  });

  it("append and getById", async () => {
    const event = makeLedgerEvent(0);
    await store.append(event);
    const retrieved = await store.getById(event.eventId);
    expect(retrieved).toBeDefined();
    expect(retrieved!.eventId).toBe(event.eventId);
    expect(retrieved!.sequenceNumber).toBe(0n);
  });

  it("getHead returns latest event", async () => {
    await store.append(makeLedgerEvent(0));
    await store.append(makeLedgerEvent(1));
    await store.append(makeLedgerEvent(2));
    const head = await store.getHead();
    expect(head!.sequenceNumber).toBe(2n);
  });

  it("count tracks events", async () => {
    expect(await store.count()).toBe(0);
    await store.append(makeLedgerEvent(0));
    await store.append(makeLedgerEvent(1));
    expect(await store.count()).toBe(2);
  });

  it("query filters by agentId", async () => {
    await store.append(makeLedgerEvent(0, { agentId: "agent-a" } as any));
    await store.append(makeLedgerEvent(1, { agentId: "agent-b" } as any));
    const results = await store.query({ agentId: "agent-a" } as any);
    expect(results).toHaveLength(1);
    expect(results[0]!.agentId).toBe("agent-a");
  });

  it("query filters by eventType", async () => {
    await store.append(makeLedgerEvent(0));
    await store.append(makeLedgerEvent(1, { eventType: "token.issued" } as any));
    const results = await store.query({ eventType: "token.issued" } as any);
    expect(results).toHaveLength(1);
  });

  it("query supports limit and offset", async () => {
    for (let i = 0; i < 5; i++) {
      await store.append(makeLedgerEvent(i));
    }
    const results = await store.query({ limit: 2, offset: 1 });
    expect(results).toHaveLength(2);
    expect(results[0]!.sequenceNumber).toBe(1n);
  });

  it("verifyChain passes for valid chain", async () => {
    await store.append(makeLedgerEvent(0));
    await store.append(makeLedgerEvent(1));
    await store.append(makeLedgerEvent(2));
    expect(await store.verifyChain()).toBe(true);
  });

  it("verifyChain fails for broken chain", async () => {
    await store.append(makeLedgerEvent(0));
    await store.append(makeLedgerEvent(1, { previousHash: "WRONG" } as any));
    expect(await store.verifyChain()).toBe(false);
  });

  it("verifyChain passes for empty store", async () => {
    expect(await store.verifyChain()).toBe(true);
  });

  it("query filters by sequence range", async () => {
    for (let i = 0; i < 5; i++) {
      await store.append(makeLedgerEvent(i));
    }
    const results = await store.query({ fromSequence: 1n, toSequence: 3n });
    expect(results).toHaveLength(3);
  });
});

describeWithPg("PgTokenStore", () => {
  let pool: pg.Pool;
  let store: PgTokenStore;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: DATABASE_URL });
    const migrationSql = readFileSync(
      join(__dirname, "../migrations/002_create_tokens.sql"),
      "utf-8",
    );
    await pool.query(migrationSql);
    store = new PgTokenStore(pool);
  });

  afterAll(async () => {
    await pool.query("DROP TABLE IF EXISTS sint_tokens");
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM sint_tokens");
  });

  it("store and get", async () => {
    const token = makeToken("tok-1");
    await store.store(token);
    const retrieved = await store.get("tok-1");
    expect(retrieved).toBeDefined();
    expect(retrieved!.tokenId).toBe("tok-1");
    expect(retrieved!.resource).toBe("ros2:///camera/front");
  });

  it("get returns undefined for unknown token", async () => {
    expect(await store.get("nonexistent")).toBeUndefined();
  });

  it("getBySubject returns all tokens for subject", async () => {
    await store.store(makeToken("tok-1"));
    await store.store(makeToken("tok-2"));
    await store.store({
      ...makeToken("tok-3"),
      subject: "other-subject",
    } as SintCapabilityToken);

    const results = await store.getBySubject("subject-pub-key");
    expect(results).toHaveLength(2);
  });

  it("remove deletes token", async () => {
    await store.store(makeToken("tok-1"));
    const removed = await store.remove("tok-1");
    expect(removed).toBe(true);
    expect(await store.get("tok-1")).toBeUndefined();
  });

  it("remove returns false for unknown token", async () => {
    expect(await store.remove("nonexistent")).toBe(false);
  });

  it("count tracks tokens", async () => {
    expect(await store.count()).toBe(0);
    await store.store(makeToken("tok-1"));
    await store.store(makeToken("tok-2"));
    expect(await store.count()).toBe(2);
  });

  it("store upserts on conflict", async () => {
    await store.store(makeToken("tok-1"));
    await store.store({
      ...makeToken("tok-1"),
      resource: "ros2:///cmd_vel",
    } as SintCapabilityToken);
    const retrieved = await store.get("tok-1");
    expect(retrieved!.resource).toBe("ros2:///cmd_vel");
  });

  it("actions are preserved as array", async () => {
    await store.store({
      ...makeToken("tok-1"),
      actions: ["publish", "subscribe"],
    } as SintCapabilityToken);
    const retrieved = await store.get("tok-1");
    expect(retrieved!.actions).toEqual(["publish", "subscribe"]);
  });
});
