/**
 * SINT Persistence — PostgreSQL schema bootstrap.
 *
 * Ensures required tables exist for production startup when
 * running with SINT_STORE=postgres and/or SINT_CACHE=redis.
 *
 * @module @sint/persistence/pg-schema
 */

import type pg from "pg";

/**
 * Create required PostgreSQL tables and indexes if absent.
 * Safe to call repeatedly across restarts.
 */
export async function ensurePgSchema(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sint_ledger_events (
      id BIGSERIAL PRIMARY KEY,
      event_id TEXT NOT NULL UNIQUE,
      sequence_number BIGINT NOT NULL UNIQUE,
      timestamp TEXT NOT NULL,
      event_type TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      token_id TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      previous_hash TEXT NOT NULL,
      hash TEXT NOT NULL
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sint_ledger_agent_seq
      ON sint_ledger_events (agent_id, sequence_number);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sint_ledger_event_type_seq
      ON sint_ledger_events (event_type, sequence_number);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sint_tokens (
      token_id TEXT PRIMARY KEY,
      issuer TEXT NOT NULL,
      subject TEXT NOT NULL,
      resource TEXT NOT NULL,
      actions JSONB NOT NULL,
      constraints JSONB NOT NULL,
      delegation_chain JSONB NOT NULL,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revocable BOOLEAN NOT NULL DEFAULT true,
      signature TEXT NOT NULL
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sint_tokens_subject
      ON sint_tokens (subject);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sint_revocations (
      token_id TEXT PRIMARY KEY,
      reason TEXT NOT NULL,
      revoked_by TEXT NOT NULL,
      revoked_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sint_rate_limit_counters (
      bucket_key TEXT PRIMARY KEY,
      count BIGINT NOT NULL DEFAULT 1,
      expires_at TIMESTAMPTZ NOT NULL
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sint_rate_limit_expires_at
      ON sint_rate_limit_counters (expires_at);
  `);
}

