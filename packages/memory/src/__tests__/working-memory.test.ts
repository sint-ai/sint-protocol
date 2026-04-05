import { describe, it, expect, beforeEach } from "vitest";
import { WorkingMemory } from "../working-memory.js";

describe("WorkingMemory", () => {
  let mem: WorkingMemory;

  beforeEach(() => {
    mem = new WorkingMemory();
  });

  describe("push", () => {
    it("should add an entry and return it", () => {
      const entry = mem.push("key1", "value1");
      expect(entry.key).toBe("key1");
      expect(entry.value).toBe("value1");
      expect(entry.source).toBe("working");
    });

    it("should set storedAt as ISO8601 timestamp", () => {
      const entry = mem.push("key1", "value1");
      expect(entry.storedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("should store tags", () => {
      const entry = mem.push("key1", "value1", ["tagA", "tagB"]);
      expect(entry.tags).toEqual(["tagA", "tagB"]);
    });

    it("should default to empty tags", () => {
      const entry = mem.push("key1", "value1");
      expect(entry.tags).toEqual([]);
    });

    it("should support non-string values", () => {
      const obj = { x: 1, y: 2 };
      const entry = mem.push("coords", obj);
      expect(entry.value).toEqual(obj);
    });

    it("should increment size", () => {
      mem.push("a", 1);
      mem.push("b", 2);
      expect(mem.size).toBe(2);
    });
  });

  describe("getRecent", () => {
    it("should return the most recent n entries", () => {
      mem.push("a", 1);
      mem.push("b", 2);
      mem.push("c", 3);
      const recent = mem.getRecent(2);
      expect(recent.map((e) => e.key)).toEqual(["b", "c"]);
    });

    it("should return all entries if n > size", () => {
      mem.push("a", 1);
      const recent = mem.getRecent(10);
      expect(recent).toHaveLength(1);
    });

    it("should return empty array if memory is empty", () => {
      expect(mem.getRecent(5)).toEqual([]);
    });
  });

  describe("getByKey", () => {
    it("should return the most recent entry with the given key", () => {
      mem.push("key1", "first");
      mem.push("key1", "second");
      const entry = mem.getByKey("key1");
      expect(entry?.value).toBe("second");
    });

    it("should return undefined for unknown key", () => {
      expect(mem.getByKey("nonexistent")).toBeUndefined();
    });

    it("should not return entries for different keys", () => {
      mem.push("key1", "val1");
      expect(mem.getByKey("key2")).toBeUndefined();
    });
  });

  describe("search", () => {
    it("should match entries by key", () => {
      mem.push("robot_position", { x: 0, y: 0 });
      mem.push("battery_level", 0.8);
      const results = mem.search("robot");
      expect(results.map((e) => e.key)).toContain("robot_position");
      expect(results.map((e) => e.key)).not.toContain("battery_level");
    });

    it("should match entries by string value", () => {
      mem.push("status", "robot is moving");
      mem.push("mode", "idle");
      const results = mem.search("moving");
      expect(results.map((e) => e.key)).toContain("status");
    });

    it("should match entries by tag", () => {
      mem.push("event1", "something", ["critical", "alert"]);
      mem.push("event2", "other", ["info"]);
      const results = mem.search("critical");
      expect(results.map((e) => e.key)).toContain("event1");
      expect(results.map((e) => e.key)).not.toContain("event2");
    });

    it("should return empty array when no match", () => {
      mem.push("key1", "value1");
      expect(mem.search("zzznomatch")).toEqual([]);
    });

    it("should be case-insensitive", () => {
      mem.push("RobotState", "ACTIVE");
      const results = mem.search("robotstate");
      expect(results).toHaveLength(1);
    });

    it("should rank key matches higher than value matches", () => {
      mem.push("robot", "something else");       // score 2 (key match)
      mem.push("sensor_data", "robot detected"); // score 1 (value match)
      const results = mem.search("robot");
      expect(results[0]!.key).toBe("robot");
    });

    it("should not match non-string values by value content", () => {
      mem.push("data", { nested: "robot" }); // object value — not searched
      const results = mem.search("robot");
      expect(results).toHaveLength(0);
    });
  });

  describe("clear", () => {
    it("should remove all entries", () => {
      mem.push("a", 1);
      mem.push("b", 2);
      mem.clear();
      expect(mem.size).toBe(0);
    });

    it("getByKey should return undefined after clear", () => {
      mem.push("key", "val");
      mem.clear();
      expect(mem.getByKey("key")).toBeUndefined();
    });
  });

  describe("maxSize eviction", () => {
    it("should evict oldest entry when maxSize is exceeded", () => {
      const small = new WorkingMemory(3);
      small.push("first", 1);
      small.push("second", 2);
      small.push("third", 3);
      small.push("fourth", 4); // should evict "first"
      expect(small.size).toBe(3);
      expect(small.getByKey("first")).toBeUndefined();
      expect(small.getByKey("fourth")).toBeDefined();
    });

    it("should maintain maxSize after multiple evictions", () => {
      const small = new WorkingMemory(2);
      for (let i = 0; i < 10; i++) {
        small.push(`key${i}`, i);
      }
      expect(small.size).toBe(2);
      const recent = small.getRecent(2);
      expect(recent.map((e) => e.key)).toEqual(["key8", "key9"]);
    });

    it("should not evict when at exactly maxSize", () => {
      const small = new WorkingMemory(3);
      small.push("a", 1);
      small.push("b", 2);
      small.push("c", 3);
      expect(small.size).toBe(3);
      expect(small.getByKey("a")).toBeDefined();
    });
  });
});
