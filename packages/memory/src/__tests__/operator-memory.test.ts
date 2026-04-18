import { describe, it, expect, beforeEach, vi } from "vitest";
import { OperatorMemory } from "../operator-memory.js";
import type { LedgerWriterLike } from "../operator-memory.js";
import type { SintEventType } from "@sint-ai/core";

interface LedgerCall {
  eventType: SintEventType;
  agentId: string;
  payload: Record<string, unknown>;
}

function makeMockLedger(): { ledger: LedgerWriterLike; calls: LedgerCall[] } {
  const calls: LedgerCall[] = [];
  const ledger: LedgerWriterLike = {
    append: vi.fn((input: { eventType: SintEventType; agentId: string; payload: Record<string, unknown> }) => {
      calls.push({ eventType: input.eventType, agentId: input.agentId, payload: input.payload });
      return { eventId: "mock-event-id" };
    }),
  };
  return { ledger, calls };
}

describe("OperatorMemory", () => {
  let calls: LedgerCall[];
  let ledger: LedgerWriterLike;
  let mem: OperatorMemory;
  const AGENT_ID = "test-agent-id";

  beforeEach(() => {
    ({ ledger, calls } = makeMockLedger());
    mem = new OperatorMemory(ledger, AGENT_ID);
  });

  describe("store", () => {
    it("should store an entry and emit a ledger event", async () => {
      const entry = await mem.store("key1", "value1");
      expect(entry.key).toBe("key1");
      expect(entry.value).toBe("value1");
      expect(entry.source).toBe("operator");
      expect(calls).toHaveLength(1);
      expect(calls[0]!.eventType).toBe("operator.memory.stored");
    });

    it("should emit ledger event with correct agentId", async () => {
      await mem.store("key1", "value1");
      expect(calls[0]!.agentId).toBe(AGENT_ID);
    });

    it("should emit ledger event with key in payload", async () => {
      await mem.store("mykey", "myval");
      expect(calls[0]!.payload["key"]).toBe("mykey");
    });

    it("should emit ledger event with value in payload (string as-is)", async () => {
      await mem.store("k", "hello");
      expect(calls[0]!.payload["value"]).toBe("hello");
    });

    it("should emit ledger event with JSON-stringified non-string value", async () => {
      await mem.store("k", { x: 1 });
      expect(calls[0]!.payload["value"]).toBe('{"x":1}');
    });

    it("should store tags and include them in payload", async () => {
      await mem.store("k", "v", ["tag1", "tag2"]);
      expect(calls[0]!.payload["tags"]).toEqual(["tag1", "tag2"]);
    });

    it("should update entry for same key", async () => {
      await mem.store("key1", "first");
      await mem.store("key1", "second");
      const all = mem.getAll();
      const entry = all.find((e) => e.key === "key1");
      expect(entry?.value).toBe("second");
    });

    it("should set ledgerEventId on returned entry", async () => {
      const entry = await mem.store("key1", "val");
      expect(entry.ledgerEventId).toBeDefined();
      expect(typeof entry.ledgerEventId).toBe("string");
    });
  });

  describe("recall", () => {
    it("should find entry matching by key", async () => {
      await mem.store("robot_position", { x: 1 });
      const results = await mem.recall("robot");
      expect(results.map((e) => e.key)).toContain("robot_position");
    });

    it("should find entry matching by string value", async () => {
      await mem.store("status", "robot is idle");
      const results = await mem.recall("idle");
      expect(results.map((e) => e.key)).toContain("status");
    });

    it("should find entry matching by tag", async () => {
      await mem.store("event1", "data", ["critical"]);
      const results = await mem.recall("critical");
      expect(results.map((e) => e.key)).toContain("event1");
    });

    it("should return empty array when no match", async () => {
      await mem.store("key1", "value1");
      const results = await mem.recall("zzznomatch");
      expect(results).toEqual([]);
    });

    it("should not emit a recall ledger event when no results", async () => {
      await mem.store("key1", "val");
      calls.length = 0;
      await mem.recall("zzznomatch");
      expect(calls).toHaveLength(0);
    });

    it("should emit a recall ledger event when results found", async () => {
      await mem.store("key1", "val");
      calls.length = 0;
      await mem.recall("key1");
      expect(calls).toHaveLength(1);
      expect(calls[0]!.eventType).toBe("operator.memory.recalled");
    });

    it("should include query and result count in recall payload", async () => {
      await mem.store("key1", "val");
      calls.length = 0;
      await mem.recall("key1");
      expect(calls[0]!.payload["query"]).toBe("key1");
      expect(calls[0]!.payload["resultCount"]).toBe(1);
    });

    it("should respect the limit parameter", async () => {
      for (let i = 0; i < 5; i++) {
        await mem.store(`robot${i}`, `val${i}`);
      }
      const results = await mem.recall("robot", 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });
  });

  describe("forget", () => {
    it("should return false for unknown key", async () => {
      const result = await mem.forget("nonexistent");
      expect(result).toBe(false);
    });

    it("should return true for known key", async () => {
      await mem.store("key1", "val");
      const result = await mem.forget("key1");
      expect(result).toBe(true);
    });

    it("should emit operator.memory.deleted ledger event", async () => {
      await mem.store("key1", "val");
      calls.length = 0;
      await mem.forget("key1");
      expect(calls).toHaveLength(1);
      expect(calls[0]!.eventType).toBe("operator.memory.deleted");
    });

    it("should include tombstone=true in payload", async () => {
      await mem.store("key1", "val");
      calls.length = 0;
      await mem.forget("key1");
      expect(calls[0]!.payload["tombstone"]).toBe(true);
    });

    it("should exclude deleted entries from getAll", async () => {
      await mem.store("key1", "val");
      await mem.forget("key1");
      expect(mem.getAll().map((e) => e.key)).not.toContain("key1");
    });

    it("should exclude deleted entries from recall", async () => {
      await mem.store("key1", "val");
      await mem.forget("key1");
      const results = await mem.recall("key1");
      expect(results).toEqual([]);
    });
  });

  describe("getAll", () => {
    it("should return all non-deleted entries", async () => {
      await mem.store("a", 1);
      await mem.store("b", 2);
      await mem.store("c", 3);
      await mem.forget("b");
      const all = mem.getAll();
      expect(all.map((e) => e.key).sort()).toEqual(["a", "c"]);
    });

    it("should return empty array when nothing stored", () => {
      expect(mem.getAll()).toEqual([]);
    });
  });

  describe("size", () => {
    it("should reflect stored minus deleted count", async () => {
      await mem.store("a", 1);
      await mem.store("b", 2);
      await mem.forget("a");
      expect(mem.size).toBe(1);
    });

    it("should be zero initially", () => {
      expect(mem.size).toBe(0);
    });
  });
});
