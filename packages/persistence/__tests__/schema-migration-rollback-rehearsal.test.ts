import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import pg from "pg";
import { afterAll, describe, expect, it } from "vitest";

function migration(name: string): string {
  return readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
}

const PREDICTIVE_COLUMNS = [
  "deployment_envelope",
  "manufacturing_envelope",
  "hazardous_energy_envelope",
  "adaptation_permit",
];

describe.skipIf(!process.env.DATABASE_URL)("migration 008 schema rollback rehearsal", () => {
  const schema = `sint_rehearse_${randomBytes(8).toString("hex")}`;
  let pool: pg.Pool | undefined;

  afterAll(async () => {
    if (!pool) return;
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).finally(() => pool!.end());
  });

  it("applies the real 008 upgrade and rollback without dropping the token row", async () => {
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set("options", `-csearch_path=${schema}`);
    pool = new pg.Pool({ connectionString: url.toString(), connectionTimeoutMillis: 2000 });
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(migration("002_create_tokens.sql"));
    await pool.query(migration("rollback/008_predictive_policy_fields.sql"));
    await pool.query(
      `INSERT INTO sint_tokens (
         token_id, issuer, subject, resource, actions, constraints, delegation_chain, issued_at, expires_at, revocable, signature
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,$10,$11)`,
      [
        "tok-rehearse",
        "issuer",
        "subject",
        "mcp://*",
        "[]",
        "{}",
        JSON.stringify({ parentTokenId: null, depth: 0, attenuated: false }),
        "2026-11-05T00:00:00.000Z",
        "2026-11-05T01:00:00.000Z",
        true,
        "sig-rehearse",
      ],
    );

    await pool.query(migration("008_predictive_policy_fields.sql"));
    const upgraded = await columnNames(pool, schema);
    for (const column of PREDICTIVE_COLUMNS) expect(upgraded).toContain(column);
    expect(upgraded).toContain("autonomy_policy");
    expect(await tokenRow(pool)).toEqual({ token_id: "tok-rehearse", signature: "sig-rehearse" });

    await pool.query(migration("rollback/008_predictive_policy_fields.sql"));
    const rolledBack = await columnNames(pool, schema);
    for (const column of PREDICTIVE_COLUMNS) expect(rolledBack).not.toContain(column);
    expect(rolledBack).toContain("autonomy_policy");
    expect(await tokenRow(pool)).toEqual({ token_id: "tok-rehearse", signature: "sig-rehearse" });
  });
});

async function columnNames(pool: pg.Pool, schema: string): Promise<string[]> {
  const found = await pool.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = 'sint_tokens'`,
    [schema],
  );
  return found.rows.map(row => row.column_name);
}

async function tokenRow(pool: pg.Pool): Promise<{ token_id: string; signature: string }> {
  const found = await pool.query(
    `SELECT token_id, signature FROM sint_tokens WHERE token_id = $1`,
    ["tok-rehearse"],
  );
  return found.rows[0];
}
