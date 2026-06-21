-- SINT Mission Authority: immutable signed manifests and append-only revocations.

CREATE TABLE IF NOT EXISTS sint_mission_manifests (
  manifest_id   TEXT PRIMARY KEY,
  platform_id   TEXT NOT NULL,
  mission_class TEXT NOT NULL,
  valid_from    TEXT NOT NULL,
  valid_until   TEXT NOT NULL,
  manifest      JSONB NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sint_mission_manifests_platform
  ON sint_mission_manifests (platform_id);
CREATE INDEX IF NOT EXISTS idx_sint_mission_manifests_class
  ON sint_mission_manifests (mission_class);
CREATE INDEX IF NOT EXISTS idx_sint_mission_manifests_validity
  ON sint_mission_manifests (valid_from, valid_until);

CREATE TABLE IF NOT EXISTS sint_mission_manifest_revocations (
  manifest_id TEXT PRIMARY KEY
    REFERENCES sint_mission_manifests (manifest_id),
  reason      TEXT NOT NULL,
  revoked_by  TEXT NOT NULL,
  revoked_at  TEXT NOT NULL
);
