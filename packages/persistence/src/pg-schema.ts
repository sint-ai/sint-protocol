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

  // Production gateway uses this schema bootstrap. Protect its ledger from
  // UPDATE, DELETE, and TRUNCATE as well as enforcing INSERT-only application code.
  await pool.query(`
    CREATE OR REPLACE FUNCTION sint_reject_ledger_mutation()
    RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      RAISE EXCEPTION 'sint_ledger_events is append-only';
    END;
    $$;
  `);
  await pool.query(`
    DROP TRIGGER IF EXISTS sint_ledger_no_update_delete ON sint_ledger_events;
    CREATE TRIGGER sint_ledger_no_update_delete
      BEFORE UPDATE OR DELETE ON sint_ledger_events
      FOR EACH ROW EXECUTE FUNCTION sint_reject_ledger_mutation();
  `);
  await pool.query(`
    DROP TRIGGER IF EXISTS sint_ledger_no_truncate ON sint_ledger_events;
    CREATE TRIGGER sint_ledger_no_truncate
      BEFORE TRUNCATE ON sint_ledger_events
      FOR EACH STATEMENT EXECUTE FUNCTION sint_reject_ledger_mutation();
  `);
  await pool.query(`REVOKE UPDATE, DELETE, TRUNCATE ON sint_ledger_events FROM PUBLIC;`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sint_tokens (
      token_id TEXT PRIMARY KEY,
      issuer TEXT NOT NULL,
      subject TEXT NOT NULL,
      resource TEXT NOT NULL,
      actions JSONB NOT NULL,
      constraints JSONB NOT NULL,
      model_constraints JSONB,
      attestation_requirements JSONB,
      verifiable_compute_requirements JSONB,
      execution_envelope JSONB,
      behavioral_constraints JSONB,
      passport_id TEXT,
      delegation_depth INTEGER,
      delegation_chain JSONB NOT NULL,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      revocable BOOLEAN NOT NULL DEFAULT true,
      revocation_endpoint TEXT,
      crypto_profile TEXT,
      post_quantum_signatures JSONB,
      autonomy_policy JSONB,
      human_authority_requirements JSONB,
      regulated_data_policy JSONB,
      deployment_envelope JSONB,
      manufacturing_envelope JSONB,
      hazardous_energy_envelope JSONB,
      adaptation_permit JSONB,
      signature TEXT NOT NULL
    );
  `);

  await pool.query(`
    ALTER TABLE sint_tokens
      ADD COLUMN IF NOT EXISTS model_constraints JSONB,
      ADD COLUMN IF NOT EXISTS attestation_requirements JSONB,
      ADD COLUMN IF NOT EXISTS verifiable_compute_requirements JSONB,
      ADD COLUMN IF NOT EXISTS execution_envelope JSONB,
      ADD COLUMN IF NOT EXISTS behavioral_constraints JSONB,
      ADD COLUMN IF NOT EXISTS passport_id TEXT,
      ADD COLUMN IF NOT EXISTS delegation_depth INTEGER,
      ADD COLUMN IF NOT EXISTS revocation_endpoint TEXT,
      ADD COLUMN IF NOT EXISTS crypto_profile TEXT,
      ADD COLUMN IF NOT EXISTS post_quantum_signatures JSONB,
      ADD COLUMN IF NOT EXISTS autonomy_policy JSONB,
      ADD COLUMN IF NOT EXISTS human_authority_requirements JSONB,
      ADD COLUMN IF NOT EXISTS regulated_data_policy JSONB,
      ADD COLUMN IF NOT EXISTS deployment_envelope JSONB,
      ADD COLUMN IF NOT EXISTS manufacturing_envelope JSONB,
      ADD COLUMN IF NOT EXISTS hazardous_energy_envelope JSONB,
      ADD COLUMN IF NOT EXISTS adaptation_permit JSONB;
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

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sint_mission_manifests (
      manifest_id TEXT PRIMARY KEY,
      platform_id TEXT NOT NULL,
      mission_class TEXT NOT NULL,
      valid_from TEXT NOT NULL,
      valid_until TEXT NOT NULL,
      manifest JSONB NOT NULL,
      registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sint_mission_manifests_platform
      ON sint_mission_manifests (platform_id);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sint_mission_manifests_class
      ON sint_mission_manifests (mission_class);
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sint_mission_manifests_validity
      ON sint_mission_manifests (valid_from, valid_until);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sint_mission_manifest_revocations (
      manifest_id TEXT PRIMARY KEY
        REFERENCES sint_mission_manifests (manifest_id),
      reason TEXT NOT NULL,
      revoked_by TEXT NOT NULL,
      revoked_at TEXT NOT NULL
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sint_mission_authority_heads (
      platform_identity TEXT PRIMARY KEY,
      manifest_id TEXT NOT NULL UNIQUE
        REFERENCES sint_mission_manifests (manifest_id),
      manifest_version INTEGER NOT NULL CHECK (manifest_version > 0),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await pool.query(`
    INSERT INTO sint_mission_authority_heads
      (platform_identity, manifest_id, manifest_version)
    SELECT DISTINCT ON (manifest->>'platformIdentity')
      manifest->>'platformIdentity',
      manifest_id,
      (manifest->>'manifestVersion')::INTEGER
    FROM sint_mission_manifests
    WHERE manifest ? 'platformIdentity'
      AND manifest ? 'manifestVersion'
    ORDER BY
      manifest->>'platformIdentity',
      (manifest->>'manifestVersion')::INTEGER DESC,
      registered_at DESC
    ON CONFLICT (platform_identity) DO NOTHING;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sint_mission_action_claims (
      action_ref TEXT PRIMARY KEY,
      manifest_id TEXT NOT NULL
        REFERENCES sint_mission_manifests (manifest_id),
      effect_id TEXT,
      claimed_at TEXT NOT NULL
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_sint_mission_action_claims_effect
      ON sint_mission_action_claims (manifest_id, effect_id)
      WHERE effect_id IS NOT NULL;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sint_mission_action_outcomes (
      action_ref TEXT PRIMARY KEY
        REFERENCES sint_mission_action_claims (action_ref),
      manifest_id TEXT NOT NULL
        REFERENCES sint_mission_manifests (manifest_id),
      outcome TEXT NOT NULL,
      completed_at TEXT NOT NULL,
      report JSONB NOT NULL
    );
  `);
}
