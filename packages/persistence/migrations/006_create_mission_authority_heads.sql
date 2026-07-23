-- Monotonic per-platform authority high-water marks for rollback protection.

CREATE TABLE IF NOT EXISTS sint_mission_authority_heads (
  platform_identity TEXT PRIMARY KEY,
  manifest_id       TEXT NOT NULL UNIQUE
    REFERENCES sint_mission_manifests (manifest_id),
  manifest_version  INTEGER NOT NULL CHECK (manifest_version > 0),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
