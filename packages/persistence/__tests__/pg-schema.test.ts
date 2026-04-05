import { describe, it, expect, vi } from "vitest";
import { ensurePgSchema } from "../src/pg-schema.js";

describe("ensurePgSchema", () => {
  it("creates all required tables and indexes idempotently", async () => {
    const query = vi.fn(async (_sql: string) => ({ rows: [] }));
    const pool = { query } as unknown as import("pg").Pool;

    await ensurePgSchema(pool);

    expect(query).toHaveBeenCalled();
    const sql = query.mock.calls.map(([statement]) => String(statement)).join("\n");

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS sint_ledger_events");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS sint_tokens");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS sint_revocations");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS sint_rate_limit_counters");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_sint_ledger_agent_seq");
    expect(sql).toContain("CREATE INDEX IF NOT EXISTS idx_sint_rate_limit_expires_at");
  });
});
