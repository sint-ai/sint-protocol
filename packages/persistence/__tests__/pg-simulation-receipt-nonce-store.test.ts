import { describe, expect, it } from "vitest";
import type pg from "pg";
import { PgSimulationReceiptNonceStore } from "../src/pg-simulation-receipt-nonce-store.js";

/** Honors INSERT ... ON CONFLICT DO NOTHING by keeping the first row only. */
function conflictPool(): pg.Pool {
  const seen = new Set<string>();
  const query = async (sql: string, params?: readonly unknown[]) => {
    const statement = String(sql);
    if (!statement.includes("INSERT INTO sint_simulation_receipt_nonces")) {
      throw new Error(`unexpected sql: ${statement}`);
    }
    if (!statement.includes("ON CONFLICT (receipt_id, nonce) DO NOTHING")) {
      throw new Error("consume must insert once");
    }
    const key = `${String(params?.[0])}:${String(params?.[1])}`;
    if (seen.has(key)) return { rows: [] };
    seen.add(key);
    return { rows: [{ receipt_id: params?.[0] }] };
  };
  return { query } as unknown as pg.Pool;
}

describe("PgSimulationReceiptNonceStore", () => {
  it("returns false when the same receipt nonce is consumed again", async () => {
    const store = new PgSimulationReceiptNonceStore(conflictPool());
    expect(await store.consume("receipt-1", "nonce-a")).toBe(true);
    expect(await store.consume("receipt-1", "nonce-a")).toBe(false);
  });
});
