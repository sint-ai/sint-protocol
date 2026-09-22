/**
 * SINT Persistence — PostgreSQL Connection Pool.
 *
 * Thin wrapper around pg.Pool with sensible defaults.
 *
 * @module @pshkv/persistence/pg-pool
 */

import pg from "pg";

export interface PgPoolConfig {
  connectionString: string;
  maxConnections?: number;
  idleTimeoutMs?: number;
}

let pool: pg.Pool | null = null;

/** Get or create the shared PostgreSQL connection pool. */
export function getPool(config: PgPoolConfig): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: config.connectionString,
      max: config.maxConnections ?? 10,
      idleTimeoutMillis: config.idleTimeoutMs ?? 30_000,
    });
  }
  return pool;
}

/** Shut down the pool (for graceful shutdown / tests). */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
