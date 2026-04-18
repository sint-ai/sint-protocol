import { describe, it, expect } from "vitest";
import { canonicalJSONStringify } from "../src/utils.js";

describe("canonicalJSONStringify", () => {
  it("produces the same output regardless of object key insertion order", () => {
    const a = { b: 1, a: 2, c: 3 };
    const b = { a: 2, b: 1, c: 3 };
    const c = { c: 3, a: 2, b: 1 };
    expect(canonicalJSONStringify(a)).toBe(canonicalJSONStringify(b));
    expect(canonicalJSONStringify(b)).toBe(canonicalJSONStringify(c));
    expect(canonicalJSONStringify(a)).toBe('{"a":2,"b":1,"c":3}');
  });

  it("sorts keys recursively at every depth", () => {
    const input = {
      z: { b: 1, a: 2 },
      a: { d: 4, c: 3 },
    };
    expect(canonicalJSONStringify(input)).toBe(
      '{"a":{"c":3,"d":4},"z":{"a":2,"b":1}}',
    );
  });

  it("preserves array element order", () => {
    expect(canonicalJSONStringify([3, 1, 2])).toBe("[3,1,2]");
    expect(canonicalJSONStringify({ xs: [{ b: 1, a: 2 }, { a: 1, b: 2 }] })).toBe(
      '{"xs":[{"a":2,"b":1},{"a":1,"b":2}]}',
    );
  });

  it("omits undefined values (matches JSON.stringify semantics for objects)", () => {
    const input = { a: 1, b: undefined, c: 2 };
    expect(canonicalJSONStringify(input)).toBe('{"a":1,"c":2}');
  });

  it("handles primitives and null", () => {
    expect(canonicalJSONStringify(null)).toBe("null");
    expect(canonicalJSONStringify(42)).toBe("42");
    expect(canonicalJSONStringify(true)).toBe("true");
    expect(canonicalJSONStringify("hi")).toBe('"hi"');
  });

  it("handles empty objects and arrays", () => {
    expect(canonicalJSONStringify({})).toBe("{}");
    expect(canonicalJSONStringify([])).toBe("[]");
  });

  it("is deterministic for a capability-token-like structure with nested constraints", () => {
    const tokenA = {
      tokenId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
      issuer: "abc",
      subject: "def",
      constraints: { maxVelocityMps: 0.5, maxForceNewtons: 50 },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      actions: ["publish"],
    };
    // Same semantic content, different property insertion order at every level.
    const tokenB = {
      actions: ["publish"],
      delegationChain: { attenuated: false, depth: 0, parentTokenId: null },
      constraints: { maxForceNewtons: 50, maxVelocityMps: 0.5 },
      subject: "def",
      issuer: "abc",
      tokenId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
    };
    expect(canonicalJSONStringify(tokenA)).toBe(canonicalJSONStringify(tokenB));
  });
});
