/**
 * @sint/persistence-postgres — PostgreSQL persistence adapters for SINT Protocol.
 *
 * @example
 * ```typescript
 * import { createPgPool, runMigrations, PgLedgerWriter, PgRevocationStore, PgRateLimitStore } from "@pshkv/persistence-postgres";
 *
 * const pool = await createPgPool({ connectionString: process.env.DATABASE_URL! });
 * await runMigrations(pool);
 *
 * const ledger = new PgLedgerWriter(pool);
 * const revocations = new PgRevocationStore(pool);
 * const rateLimits = new PgRateLimitStore(pool);
 * ```
 */

export { createPgPool } from "./pg-pool.js";
export type { PgPool, PgPoolConfig, PgQueryResult } from "./pg-pool.js";

export { PgLedgerWriter } from "./pg-ledger-writer.js";
export { PgRevocationStore } from "./pg-revocation-store.js";
export type { RevocationRecord, RevocationCheckResult } from "./pg-revocation-store.js";
export { PgRateLimitStore } from "./pg-rate-limit-store.js";

export { runMigrations } from "./migrations.js";
