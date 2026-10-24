import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach } from "vitest";
import pg from "pg";

/** Every case owns a schema; teardown never targets shared tables. */
export function isolatedPostgres(migrations: readonly string[]): { pool: () => pg.Pool } {
  let pool: pg.Pool | undefined;
  let schema: string;
  beforeEach(async () => {
    schema = `sint_it_${randomBytes(12).toString("hex")}`;
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set("options", `-csearch_path=${schema}`);
    pool = new pg.Pool({ connectionString: url.toString(), connectionTimeoutMillis: 2000 });
    await pool.query(`CREATE SCHEMA ${schema}`);
    for (const migration of migrations) {
      await pool.query(readFileSync(new URL(`../../migrations/${migration}`, import.meta.url), "utf8"));
    }
  });
  afterEach(async () => {
    if (pool) await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).finally(() => pool!.end());
  });
  return { pool: () => pool! };
}
