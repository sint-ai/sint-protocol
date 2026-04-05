import { describe, it, expect, beforeEach, vi } from "vitest";
import { MemoryBank } from "../memory-bank.js";
import { WorkingMemory } from "../working-memory.js";
import { OperatorMemory } from "../operator-memory.js";
import type { LedgerWriterLike } from "../operator-memory.js";
import type { SintEventType } from "@sint/core";

function makeMockLedger(): LedgerWriterLike {
  return {
    append: vi.fn((_input: { eventType: SintEventType; agentId: string; payload: Record<string, unknown> }) => ({
      eventId: "mock-id",
    })),
  };
}

function makeBank(): { bank: MemoryBank; working: WorkingMemory; persistent: OperatorMemory; ledger: LedgerWriterLike } {
  const ledger = makeMockLedger();
  const working = new WorkingMemory();
  const persistent = new OperatorMemory(ledger, "test-agent");
  const bank = new MemoryBank(working, persistent);
  return { bank, working, persistent, ledger };
}

describe("MemoryBank", () => {
  let bank: MemoryBank;
  let working: WorkingMemory;
  let persistent: OperatorMemory;

  beforeEach(() => {
    ({ bank, working, persistent } = makeBank());
  });

  describe("store with persist=false (default)", () => {
    it("should add entry to working memory", async () => {
      await bank.store("key1", "value1");
      expect(working.getByKey("key1")).toBeDefined();
    });

    it("should not add entry to persistent memory", async () => {
      await bank.store("key1", "value1");
      expect(persistent.getAll()).toHaveLength(0);
    });

    it("should return the stored entry", async () => {
      const entry = await bank.store("key1", "value1");
      expect(entry.key).toBe("key1");
      expect(entry.source).toBe("working");
    });

    it("should increment workingSize", async () => {
      await bank.store("key1", "val1");
      await bank.store("key2", "val2");
      expect(bank.workingSize).toBe(2);
    });

    it("should not increment persistentSize", async () => {
      await bank.store("key1", "val1");
      expect(bank.persistentSize).toBe(0);
    });
  });

  describe("store with persist=true", () => {
    it("should add entry to persistent memory", async () => {
      await bank.store("key1", "value1", [], true);
      expect(persistent.getAll()).toHaveLength(1);
    });

    it("should also cache in working memory", async () => {
      await bank.store("key1", "value1", [], true);
      expect(working.getByKey("key1")).toBeDefined();
    });

    it("should return entry with source=operator", async () => {
      const entry = await bank.store("key1", "value1", [], true);
      expect(entry.source).toBe("operator");
    });

    it("should increment both working and persistent sizes", async () => {
      await bank.store("key1", "val1", [], true);
      expect(bank.workingSize).toBe(1);
      expect(bank.persistentSize).toBe(1);
    });

    it("should store tags correctly", async () => {
      const entry = await bank.store("key1", "val", ["a", "b"], true);
      expect(entry.tags).toEqual(["a", "b"]);
    });
  });

  describe("recall", () => {
    it("should return results from working memory", async () => {
      await bank.store("robot_state", "active");
      const results = await bank.recall("robot");
      expect(results.map((e) => e.key)).toContain("robot_state");
    });

    it("should return results from persistent memory", async () => {
      await bank.store("persist_key", "data", [], true);
      const results = await bank.recall("persist");
      expect(results.map((e) => e.key)).toContain("persist_key");
    });

    it("should deduplicate by key — persistent wins over working", async () => {
      // Store in working memory first
      await bank.store("key1", "working-value");
      // Store in persistent (also caches in working)
      await bank.store("key1", "persistent-value", [], true);

      const results = await bank.recall("key1");
      // Should only appear once
      const key1Results = results.filter((e) => e.key === "key1");
      expect(key1Results).toHaveLength(1);
      // Persistent wins
      expect(key1Results[0]!.source).toBe("operator");
    });

    it("should return empty array when no match in either store", async () => {
      await bank.store("key1", "val");
      const results = await bank.recall("zzznomatch");
      expect(results).toEqual([]);
    });

    it("should respect the limit parameter", async () => {
      for (let i = 0; i < 10; i++) {
        await bank.store(`robot${i}`, `val${i}`);
      }
      const results = await bank.recall("robot", 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it("should merge results from both stores into single list", async () => {
      await bank.store("working_only", "data1");
      await bank.store("persistent_only", "data2", [], true);
      const results = await bank.recall("data");
      const keys = results.map((e) => e.key);
      expect(keys).toContain("working_only");
      expect(keys).toContain("persistent_only");
    });
  });

  describe("forget", () => {
    it("should remove from persistent memory", async () => {
      await bank.store("key1", "val", [], true);
      await bank.forget("key1");
      expect(persistent.getAll()).toHaveLength(0);
    });

    it("should clear working memory", async () => {
      await bank.store("key1", "val");
      await bank.store("key2", "val2");
      await bank.store("persisted", "val3", [], true);
      await bank.forget("persisted");
      // working memory is cleared entirely on forget
      expect(bank.workingSize).toBe(0);
    });

    it("should handle forgetting a key that is not in persistent memory gracefully", async () => {
      await bank.store("key1", "val"); // working only
      // Should not throw
      await expect(bank.forget("key1")).resolves.toBeUndefined();
    });
  });

  describe("workingSize and persistentSize", () => {
    it("should report 0 for both when empty", () => {
      expect(bank.workingSize).toBe(0);
      expect(bank.persistentSize).toBe(0);
    });

    it("should correctly track sizes independently", async () => {
      await bank.store("w1", "v");
      await bank.store("w2", "v");
      await bank.store("p1", "v", [], true); // also adds to working
      expect(bank.workingSize).toBe(3);
      expect(bank.persistentSize).toBe(1);
    });
  });
});
