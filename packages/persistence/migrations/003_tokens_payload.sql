-- SINT Persistence: migrate sint_tokens to a payload-JSONB layout.
--
-- Rationale: SintCapabilityToken keeps gaining optional fields
-- (modelConstraints, attestationRequirements, verifiableComputeRequirements,
-- executionEnvelope, behavioralConstraints, passportId, delegationDepth,
-- revocationEndpoint). Per-field columns silently dropped any field added
-- after the initial schema, causing signature verification to fail
-- round-trip (issue #169).
--
-- New layout: the full canonical token is stored as one JSONB `payload`
-- column. A small set of scalar columns (token_id, subject, issuer,
-- resource, expires_at) is kept for indexed lookup. Adding a new optional
-- field to the type requires no schema change.
--
-- Safe to run against databases that have (a) only 002 applied,
-- (b) 003 already applied (no-op), or (c) the fresh 003 layout from
-- `ensurePgSchema`.

ALTER TABLE sint_tokens
  ADD COLUMN IF NOT EXISTS payload JSONB;

-- Backfill payload from legacy columns for rows where it's still NULL.
-- Only references legacy columns via to_jsonb(sint_tokens) so this is a
-- no-op when those columns have already been dropped.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sint_tokens' AND column_name = 'actions'
  ) THEN
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
  END IF;
END$$;

ALTER TABLE sint_tokens
  ALTER COLUMN payload SET NOT NULL;

-- Drop legacy columns now that their content lives in payload. token_id,
-- subject, issuer, resource, expires_at remain for indexed lookup.
ALTER TABLE sint_tokens
  DROP COLUMN IF EXISTS actions,
  DROP COLUMN IF EXISTS constraints,
  DROP COLUMN IF EXISTS delegation_chain,
  DROP COLUMN IF EXISTS issued_at,
  DROP COLUMN IF EXISTS revocable,
  DROP COLUMN IF EXISTS signature;
