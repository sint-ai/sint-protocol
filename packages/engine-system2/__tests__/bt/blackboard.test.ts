import { describe, it, expect } from "vitest";
import { Blackboard } from "../../src/bt/blackboard.js";

describe("Blackboard", () => {
  it("set and get value", () => {
    const bb = new Blackboard();
    bb.set("speed", 1.5);
    expect(bb.get<number>("speed")).toBe(1.5);
  });

  it("has returns true/false correctly", () => {
    const bb = new Blackboard();
    expect(bb.has("key")).toBe(false);
    bb.set("key", "value");
    expect(bb.has("key")).toBe(true);
  });

  it("delete removes entry", () => {
    const bb = new Blackboard();
    bb.set("key", "value");
    expect(bb.delete("key")).toBe(true);
    expect(bb.has("key")).toBe(false);
    expect(bb.delete("key")).toBe(false);
  });

  it("snapshot returns frozen copy", () => {
    const bb = new Blackboard();
    bb.set("a", 1);
    bb.set("b", 2);
    const snap = bb.snapshot();
    expect(snap).toEqual({ a: 1, b: 2 });
    expect(Object.isFrozen(snap)).toBe(true);
  });

  it("clear removes all entries", () => {
    const bb = new Blackboard();
    bb.set("a", 1);
    bb.set("b", 2);
    bb.clear();
    expect(bb.has("a")).toBe(false);
    expect(bb.has("b")).toBe(false);
  });

  it("get returns undefined for missing key", () => {
    const bb = new Blackboard();
    expect(bb.get("nonexistent")).toBeUndefined();
  });
});
