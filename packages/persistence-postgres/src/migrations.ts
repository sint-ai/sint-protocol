/**
 * SINT Persistence Postgres — Schema Migrations.
 *
 * Creates all required tables if they do not already exist.
 * Safe to run multiple times (idempotent — uses CREATE TABLE IF NOT EXISTS).
 *
 * Call `runMigrations(pool)` once at startup before any reads or writes.
 *
 * @module @sint/persistence-postgres/migrations
 */

import type { PgPool } from "./pg-pool.js";

/**
 * Create all SINT PostgreSQL tables.
 *
 * Tables created:
 *   - `sint_ledger_events`        — append-only hash-chained audit log
 *   - `sint_revocations`          — permanent token revocation records
 *   - `sint_rate_limit_counters`  — sliding-window call counters
 *
 * @param pool - A connected PgPool instance (from createPgPool or a mock)
 */
export async function runMigrations(pool: PgPool): Promise<void> {
  // -------------------------------------------------------------------------
  // 1. Ledger events — append-only, hash-chained
  // -------------------------------------------------------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sint_ledger_events (
      id              SERIAL PRIMARY KEY,
      event_id        UUID NOT NULL UNIQUE,
      sequence_number BIGINT NOT NULL,
      agent_id        TEXT NOT NULL,
      token_id        TEXT,
      event_type      TEXT NOT NULL,
      payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
      prev_hash       TEXT NOT NULL,
      hash            TEXT NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS sint_ledger_events_agent_id_idx
      ON sint_ledger_events (agent_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS sint_ledger_events_sequence_number_idx
      ON sint_ledger_events (sequence_number)
  `);

  // -------------------------------------------------------------------------
  // 2. Token revocations — permanent, keyed by token_id
  // -------------------------------------------------------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sint_revocations (
      token_id    TEXT PRIMARY KEY,
      reason      TEXT NOT NULL,
      revoked_by  TEXT NOT NULL,
      revoked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // -------------------------------------------------------------------------
  // 3. Rate limit counters — sliding window buckets
  // -------------------------------------------------------------------------
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sint_rate_limit_counters (
      bucket_key  TEXT PRIMARY KEY,
      count       BIGINT NOT NULL DEFAULT 1,
      expires_at  TIMESTAMPTZ NOT NULL
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS sint_rate_limit_expires_at_idx
      ON sint_rate_limit_counters (expires_at)
  `);
}
