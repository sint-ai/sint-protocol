/**
 * @sint/persistence-postgres — Canonical certification fixture tests.
 *
 * Aligns adapter behavior with shared protocol fixture artifacts.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi } from "vitest";
import type { PgPool, PgQueryResult } from "../pg-pool.js";
import { PgLedgerWriter } from "../pg-ledger-writer.js";
import { PgRevocationStore } from "../pg-revocation-store.js";
import { PgRateLimitStore } from "../pg-rate-limit-store.js";

interface PersistenceCertFixture {
  fixtureId: string;
  ledgerRows: Array<Record<string, unknown>>;
  revocationRow: Record<string, unknown>;
  expected: {
    ledgerCount: number;
    headSequence: string;
    chainIntegrity: boolean;
    revokedTokenResult: {
      ok: false;
      reason: string;
      revokedBy: string;
    };
    incrementCount: number;
  };
}

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = resolve(
  HERE,
  "../../../../packages/conformance-tests/fixtures/persistence/postgres-adapter-cert.v1.json",
);

function loadFixture(): PersistenceCertFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as PersistenceCertFixture;
}

function makePool(handler: (sql: string) => PgQueryResult | Promise<PgQueryResult>): PgPool {
  return {
    query: vi.fn().mockImplementation(async (sql: string) => handler(sql)),
    end: vi.fn().mockResolvedValue(undefined),
  };
}

describe("Postgres adapter certification fixtures", () => {
  it("ledger fixture maps canonical rows and preserves chain semantics", async () => {
    const fixture = loadFixture();
    const rows = fixture.ledgerRows;
    const head = rows[rows.length - 1]!;

    const pool = makePool((sql) => {
      if (sql.includes("COUNT(*)")) {
        return { rows: [{ cnt: String(fixture.expected.ledgerCount) }], rowCount: 1 };
      }
      if (sql.includes("ORDER BY sequence_number DESC")) {
        return { rows: [head], rowCount: 1 };
      }
      return { rows, rowCount: rows.length };
    });

    const writer = new PgLedgerWriter(pool);

    const queried = await writer.query({});
    expect(queried.length).toBe(fixture.expected.ledgerCount);
    expect(String(queried[0]?.eventId)).toBe(String(rows[0]?.event_id));

    const headEvent = await writer.getHead();
    expect(String(headEvent?.sequenceNumber)).toBe(fixture.expected.headSequence);

    const count = await writer.count();
    expect(count).toBe(fixture.expected.ledgerCount);

    const chainOk = await writer.verifyChain();
    expect(chainOk).toBe(fixture.expected.chainIntegrity);
  });

  it("revocation fixture enforces revoked-token contract", async () => {
    const fixture = loadFixture();
    const pool = makePool(() => ({
      rows: [fixture.revocationRow],
      rowCount: 1,
    }));

    const store = new PgRevocationStore(pool);
    const result = await store.checkRevocation("tok-revoked" as any);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe(fixture.expected.revokedTokenResult.reason);
      expect(result.revokedBy).toBe(fixture.expected.revokedTokenResult.revokedBy);
    }
  });

  it("rate-limit fixture preserves atomic increment contract", async () => {
    const fixture = loadFixture();
    const pool = makePool(() => ({
      rows: [{ count: String(fixture.expected.incrementCount) }],
      rowCount: 1,
    }));

    const store = new PgRateLimitStore(pool);
    const next = await store.increment("sint:rate:fixture", 60_000);
    expect(next).toBe(fixture.expected.incrementCount);
  });
});
