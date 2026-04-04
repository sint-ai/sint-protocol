/**
 * SINT Persistence Postgres — Lazy pg pool loader.
 *
 * Loads `pg` at runtime so the package has zero hard dependencies at install
 * time. If `pg` is not installed, throws a helpful error message.
 *
 * @module @sint/persistence-postgres/pg-pool
 */

/**
 * Minimal interface for a pg query result — avoids importing pg types.
 */
export interface PgQueryResult {
  rows: unknown[];
  rowCount: number | null;
}

/**
 * Minimal interface for a pg Pool-compatible object.
 * Accepting this interface (rather than the concrete pg.Pool) allows unit
 * tests to inject a mock without installing pg.
 */
export interface PgPool {
  query(text: string, values?: unknown[]): Promise<PgQueryResult>;
  end(): Promise<void>;
}

export interface PgPoolConfig {
  connectionString: string;
  maxConnections?: number;
  idleTimeoutMs?: number;
}

/**
 * Lazily load pg and create a Pool.
 *
 * @throws {Error} if pg is not installed.
 */
export async function createPgPool(config: PgPoolConfig): Promise<PgPool> {
  // Use Function constructor to bypass static analysis — pg is an optional
  // peer dependency and may not be installed. skipLibCheck helps, but we also
  // need to avoid the static `import("pg")` path so TypeScript doesn't try to
  // resolve its types at compile time.
  const dynamicImport = new Function("m", "return import(m)") as (m: string) => Promise<unknown>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let pgMod: any;
  try {
    pgMod = await dynamicImport("pg");
  } catch {
    throw new Error(
      "[sint/persistence-postgres] pg is not installed. " +
      "Run: npm install pg  (or pnpm add pg / yarn add pg)",
    );
  }

  // pg exports Pool as default.Pool (CJS interop) or directly
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
  const Pool = pgMod?.default?.Pool ?? pgMod?.Pool;
  if (!Pool) {
    throw new Error("[sint/persistence-postgres] Could not resolve pg.Pool — unexpected pg module shape.");
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
  return new Pool({
    connectionString: config.connectionString,
    max: config.maxConnections ?? 10,
    idleTimeoutMillis: config.idleTimeoutMs ?? 30_000,
  }) as PgPool;
}
