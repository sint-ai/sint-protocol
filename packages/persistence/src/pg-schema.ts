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

  // Capability tokens: the full canonical token lives in `payload` (JSONB)
  // so new optional fields on SintCapabilityToken round-trip without schema
  // churn. A small set of indexed scalar columns supports lookup. See #169.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sint_tokens (
      token_id   TEXT PRIMARY KEY,
      issuer     TEXT NOT NULL,
      subject    TEXT NOT NULL,
      resource   TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      payload    JSONB NOT NULL
    );
  `);

  // Self-heal legacy installs (schema from 002) by adding payload, backfilling
  // it from legacy columns, then dropping them. Matches migration 003.
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'sint_tokens' AND column_name = 'actions'
      ) THEN
        ALTER TABLE sint_tokens ADD COLUMN IF NOT EXISTS payload JSONB;
        UPDATE sint_tokens
        SET payload = jsonb_build_object(
          'tokenId', token_id,
          'issuer', issuer,
          'subject', subject,
          'resource', resource,
          'actions', actions,
          'constraints', constraints,
          'delegationChain', delegation_chain,
          'issuedAt', issued_at,
          'expiresAt', expires_at,
          'revocable', revocable,
          'signature', signature
        )
        WHERE payload IS NULL;
        ALTER TABLE sint_tokens ALTER COLUMN payload SET NOT NULL;
        ALTER TABLE sint_tokens
          DROP COLUMN IF EXISTS actions,
          DROP COLUMN IF EXISTS constraints,
          DROP COLUMN IF EXISTS delegation_chain,
          DROP COLUMN IF EXISTS issued_at,
          DROP COLUMN IF EXISTS revocable,
          DROP COLUMN IF EXISTS signature;
      END IF;
    END$$;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sint_tokens_subject
      ON sint_tokens (subject);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sint_tokens_issuer
      ON sint_tokens (issuer);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sint_tokens_resource
      ON sint_tokens (resource);
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

