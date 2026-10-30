-- Retain signed deployment, manufacturing, hazardous-energy and adaptation policies.
-- Additive and idempotent; existing signed rows are never rewritten.
ALTER TABLE sint_tokens
  ADD COLUMN IF NOT EXISTS deployment_envelope JSONB,
  ADD COLUMN IF NOT EXISTS manufacturing_envelope JSONB,
  ADD COLUMN IF NOT EXISTS hazardous_energy_envelope JSONB,
  ADD COLUMN IF NOT EXISTS adaptation_permit JSONB;
