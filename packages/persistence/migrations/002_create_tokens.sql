-- SINT Persistence: Capability tokens table.

CREATE TABLE IF NOT EXISTS sint_tokens (
  token_id          TEXT PRIMARY KEY,
  issuer            TEXT NOT NULL,
  subject           TEXT NOT NULL,
  resource          TEXT NOT NULL,
  actions           JSONB NOT NULL,
  constraints       JSONB NOT NULL DEFAULT '{}',
  model_constraints JSONB,
  attestation_requirements JSONB,
  verifiable_compute_requirements JSONB,
  execution_envelope JSONB,
  behavioral_constraints JSONB,
  passport_id       TEXT,
  delegation_depth  INTEGER,
  delegation_chain  JSONB NOT NULL,
  issued_at         TEXT NOT NULL,
  expires_at        TEXT NOT NULL,
  revocable         BOOLEAN NOT NULL DEFAULT TRUE,
  revocation_endpoint TEXT,
  signature         TEXT NOT NULL
);

ALTER TABLE sint_tokens
  ADD COLUMN IF NOT EXISTS model_constraints JSONB,
  ADD COLUMN IF NOT EXISTS attestation_requirements JSONB,
  ADD COLUMN IF NOT EXISTS verifiable_compute_requirements JSONB,
  ADD COLUMN IF NOT EXISTS execution_envelope JSONB,
  ADD COLUMN IF NOT EXISTS behavioral_constraints JSONB,
  ADD COLUMN IF NOT EXISTS passport_id TEXT,
  ADD COLUMN IF NOT EXISTS delegation_depth INTEGER,
  ADD COLUMN IF NOT EXISTS revocation_endpoint TEXT;

CREATE INDEX IF NOT EXISTS idx_tokens_subject ON sint_tokens (subject);
CREATE INDEX IF NOT EXISTS idx_tokens_issuer ON sint_tokens (issuer);
CREATE INDEX IF NOT EXISTS idx_tokens_resource ON sint_tokens (resource);
