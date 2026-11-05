-- Reverse 008_predictive_policy_fields.sql.
-- Drops only the four predictive columns. Token rows and earlier columns stay.
ALTER TABLE sint_tokens
  DROP COLUMN IF EXISTS deployment_envelope,
  DROP COLUMN IF EXISTS manufacturing_envelope,
  DROP COLUMN IF EXISTS hazardous_energy_envelope,
  DROP COLUMN IF EXISTS adaptation_permit;
