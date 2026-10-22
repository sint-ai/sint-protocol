-- Preserve every token-bound policy included in the Ed25519 signing payload.
-- Additive and idempotent; do not backfill or infer missing signed policy data.
ALTER TABLE sint_tokens
  ADD COLUMN IF NOT EXISTS autonomy_policy JSONB,
  ADD COLUMN IF NOT EXISTS human_authority_requirements JSONB,
  ADD COLUMN IF NOT EXISTS regulated_data_policy JSONB;
