import { describe, expect, it } from "vitest";
import { canonicalJsonStringify } from "../src/canonical-json.js";

describe("canonicalJsonStringify", () => {
  it("sorts object keys recursively", () => {
    const value = {
      z: 1,
      a: {
        d: true,
        b: [3, { y: 2, x: 1 }],
      },
      m: "ok",
    };

    expect(canonicalJsonStringify(value)).toBe(
      '{"a":{"b":[3,{"x":1,"y":2}],"d":true},"m":"ok","z":1}',
    );
  });

  it("ignores undefined object values", () => {
    expect(
      canonicalJsonStringify({
        b: 2,
        a: undefined,
      }),
    ).toBe('{"b":2}');
  });

  it("rejects non-finite numbers", () => {
    expect(() => canonicalJsonStringify({ bad: Number.NaN })).toThrow(/non-finite/);
    expect(() => canonicalJsonStringify({ bad: Number.POSITIVE_INFINITY })).toThrow(/non-finite/);
  });
});
