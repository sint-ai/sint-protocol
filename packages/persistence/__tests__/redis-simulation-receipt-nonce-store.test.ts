import { describe, expect, it } from "vitest";
import type { Redis } from "ioredis";
import { RedisSimulationReceiptNonceStore } from "../src/redis-simulation-receipt-nonce-store.js";

/** Honors SET NX by keeping the first key only. */
function nxRedis(): Redis {
  const seen = new Set<string>();
  const set = async (key: string, _value: string, ...args: readonly unknown[]) => {
    if (!args.includes("NX")) throw new Error("consume must set NX");
    if (seen.has(key)) return null;
    seen.add(key);
    return "OK";
  };
  return { set } as unknown as Redis;
}

describe("RedisSimulationReceiptNonceStore", () => {
  it("returns false when the same receipt nonce is consumed again", async () => {
    const store = new RedisSimulationReceiptNonceStore(nxRedis());
    expect(await store.consume("receipt-1", "nonce-a")).toBe(true);
    expect(await store.consume("receipt-1", "nonce-a")).toBe(false);
    expect(await store.consume("receipt-1", "nonce-b")).toBe(true);
    expect(await store.consume("receipt-2", "nonce-a")).toBe(true);
  });
});
