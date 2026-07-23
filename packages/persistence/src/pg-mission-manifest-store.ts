/**
 * PostgreSQL mission manifest and revocation store.
 *
 * Signed manifest rows are insert-only. Revocations are separate append-only
 * records so revoking authority never mutates the signed mission envelope.
 */

import type pg from "pg";
import type {
  MissionManifest,
  MissionManifestRevocation,
  MissionActionOutcomeReport,
  UUIDv7,
} from "@pshkv/core";
import type {
  MissionActionClaim,
  MissionActionClaimResult,
  MissionActionOutcomeResult,
  MissionManifestStoreResult,
  MissionManifestQuery,
  MissionManifestStore,
} from "./interfaces.js";

function rowToManifest(row: { manifest: MissionManifest | string }): MissionManifest {
  return typeof row.manifest === "string"
    ? JSON.parse(row.manifest) as MissionManifest
    : row.manifest;
}

function rowToRevocation(row: {
  manifest_id: UUIDv7;
  reason: string;
  revoked_by: string;
  revoked_at: string;
}): MissionManifestRevocation {
  return {
    manifestId: row.manifest_id,
    reason: row.reason,
    revokedBy: row.revoked_by,
    revokedAt: row.revoked_at,
  };
}

function rowToActionClaim(row: {
  action_ref: string;
  manifest_id: UUIDv7;
  effect_id: string | null;
  claimed_at: string;
}): MissionActionClaim {
  return {
    actionRef: row.action_ref,
    manifestId: row.manifest_id,
    ...(row.effect_id ? { effectId: row.effect_id } : {}),
    claimedAt: row.claimed_at,
  };
}

function rowToActionOutcome(row: {
  report: MissionActionOutcomeReport | string;
}): MissionActionOutcomeReport {
  return typeof row.report === "string"
    ? JSON.parse(row.report) as MissionActionOutcomeReport
    : row.report;
}

export class PgMissionManifestStore implements MissionManifestStore {
  constructor(private readonly pool: pg.Pool) {}

  async store(manifest: MissionManifest): Promise<MissionManifestStoreResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`mission-authority:${manifest.platformIdentity}`],
      );

      const existing = await client.query(
        "SELECT manifest FROM sint_mission_manifests WHERE manifest_id = $1",
        [manifest.manifestId],
      );
      if (existing.rows.length > 0) {
        await client.query("COMMIT");
        return { status: "duplicate", manifest: rowToManifest(existing.rows[0]) };
      }

      const current = await client.query(
        `SELECT manifests.manifest
         FROM sint_mission_authority_heads AS heads
         JOIN sint_mission_manifests AS manifests
           ON manifests.manifest_id = heads.manifest_id
         WHERE heads.platform_identity = $1`,
        [manifest.platformIdentity],
      );
      if (current.rows.length > 0) {
        const head = rowToManifest(current.rows[0]);
        if (manifest.manifestVersion <= head.manifestVersion) {
          await client.query("COMMIT");
          return { status: "rollback", head };
        }
        if (manifest.parentManifestId !== head.manifestId) {
          await client.query("COMMIT");
          return { status: "fork", head };
        }
      }

      await client.query(
        `INSERT INTO sint_mission_manifests
          (manifest_id, platform_id, mission_class, valid_from, valid_until, manifest)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          manifest.manifestId,
          manifest.platformId,
          manifest.missionClass,
          manifest.validFrom,
          manifest.validUntil,
          JSON.stringify(manifest),
        ],
      );
      await client.query(
        `INSERT INTO sint_mission_authority_heads
          (platform_identity, manifest_id, manifest_version)
         VALUES ($1, $2, $3)
         ON CONFLICT (platform_identity) DO UPDATE
         SET manifest_id = EXCLUDED.manifest_id,
             manifest_version = EXCLUDED.manifest_version,
             updated_at = now()`,
        [manifest.platformIdentity, manifest.manifestId, manifest.manifestVersion],
      );
      await client.query("COMMIT");
      return { status: "stored", manifest };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async get(manifestId: UUIDv7): Promise<MissionManifest | undefined> {
    const result = await this.pool.query(
      "SELECT manifest FROM sint_mission_manifests WHERE manifest_id = $1",
      [manifestId],
    );
    return result.rows.length > 0 ? rowToManifest(result.rows[0]) : undefined;
  }

  async getAuthorityHead(
    platformIdentity: string,
  ): Promise<MissionManifest | undefined> {
    const result = await this.pool.query(
      `SELECT manifests.manifest
       FROM sint_mission_authority_heads AS heads
       JOIN sint_mission_manifests AS manifests
         ON manifests.manifest_id = heads.manifest_id
       WHERE heads.platform_identity = $1`,
      [platformIdentity],
    );
    return result.rows.length > 0 ? rowToManifest(result.rows[0]) : undefined;
  }

  async list(query: MissionManifestQuery = {}): Promise<readonly MissionManifest[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (query.platformId) {
      params.push(query.platformId);
      conditions.push(`platform_id = $${params.length}`);
    }
    if (query.missionClass) {
      params.push(query.missionClass);
      conditions.push(`mission_class = $${params.length}`);
    }
    if (query.activeAt) {
      params.push(query.activeAt);
      conditions.push(`valid_from <= $${params.length}`);
      conditions.push(`valid_until > $${params.length}`);
    }

    const where = conditions.length > 0
      ? ` WHERE ${conditions.join(" AND ")}`
      : "";
    const result = await this.pool.query(
      `SELECT manifest FROM sint_mission_manifests${where}
       ORDER BY registered_at ASC, manifest_id ASC`,
      params,
    );
    return result.rows.map(rowToManifest);
  }

  async revoke(revocation: MissionManifestRevocation): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO sint_mission_manifest_revocations
        (manifest_id, reason, revoked_by, revoked_at)
       SELECT manifest_id, $2, $3, $4
       FROM sint_mission_manifests
       WHERE manifest_id = $1
       ON CONFLICT (manifest_id) DO NOTHING
       RETURNING manifest_id`,
      [
        revocation.manifestId,
        revocation.reason,
        revocation.revokedBy,
        revocation.revokedAt,
      ],
    );
    return (result.rowCount ?? result.rows.length) > 0;
  }

  async getRevocation(
    manifestId: UUIDv7,
  ): Promise<MissionManifestRevocation | undefined> {
    const result = await this.pool.query(
      `SELECT manifest_id, reason, revoked_by, revoked_at
       FROM sint_mission_manifest_revocations
       WHERE manifest_id = $1`,
      [manifestId],
    );
    return result.rows.length > 0 ? rowToRevocation(result.rows[0]) : undefined;
  }

  async claimAction(
    claim: MissionActionClaim,
    effectMaxUses?: number,
  ): Promise<MissionActionClaimResult> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`action:${claim.actionRef}`],
      );
      if (claim.effectId && effectMaxUses !== undefined) {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
          [`effect:${claim.manifestId}:${claim.effectId}`],
        );
      }

      const existing = await client.query(
        `SELECT action_ref, manifest_id, effect_id, claimed_at
         FROM sint_mission_action_claims
         WHERE action_ref = $1`,
        [claim.actionRef],
      );
      if (existing.rows.length > 0) {
        await client.query("COMMIT");
        return { status: "duplicate", claim: rowToActionClaim(existing.rows[0]) };
      }

      if (claim.effectId && effectMaxUses !== undefined) {
        const usage = await client.query(
          `SELECT COUNT(*)::integer AS count
           FROM sint_mission_action_claims
           WHERE manifest_id = $1 AND effect_id = $2`,
          [claim.manifestId, claim.effectId],
        );
        if (Number(usage.rows[0]?.count ?? 0) >= effectMaxUses) {
          await client.query("COMMIT");
          return { status: "effect_limit_exceeded" };
        }
      }

      const inserted = await client.query(
        `INSERT INTO sint_mission_action_claims
          (action_ref, manifest_id, effect_id, claimed_at)
         VALUES ($1, $2, $3, $4)
         RETURNING action_ref, manifest_id, effect_id, claimed_at`,
        [
          claim.actionRef,
          claim.manifestId,
          claim.effectId ?? null,
          claim.claimedAt,
        ],
      );
      await client.query("COMMIT");
      return { status: "claimed", claim: rowToActionClaim(inserted.rows[0]) };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async finalizeAction(
    report: MissionActionOutcomeReport,
  ): Promise<MissionActionOutcomeResult> {
    const inserted = await this.pool.query(
      `INSERT INTO sint_mission_action_outcomes
        (action_ref, manifest_id, outcome, completed_at, report)
       SELECT action_ref, $2, $3, $4, $5
       FROM sint_mission_action_claims
       WHERE action_ref = $1 AND manifest_id = $2
       ON CONFLICT (action_ref) DO NOTHING
       RETURNING report`,
      [
        report.actionRef,
        report.manifestId,
        report.outcome,
        report.completedAt,
        JSON.stringify(report),
      ],
    );
    if (inserted.rows.length > 0) {
      return { status: "finalized", report: rowToActionOutcome(inserted.rows[0]) };
    }

    const existing = await this.pool.query(
      "SELECT report FROM sint_mission_action_outcomes WHERE action_ref = $1",
      [report.actionRef],
    );
    return existing.rows.length > 0
      ? { status: "duplicate", report: rowToActionOutcome(existing.rows[0]) }
      : { status: "missing_claim" };
  }
}
