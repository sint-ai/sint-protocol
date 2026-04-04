/**
 * SINT Persistence Postgres — PostgreSQL Revocation Store.
 *
 * Stores token revocations in PostgreSQL so that revocations persist across
 * process restarts and are shared across distributed gateway nodes.
 *
 * Table: sint_revocations
 *   token_id    TEXT PRIMARY KEY
 *   reason      TEXT NOT NULL
 *   revoked_by  TEXT NOT NULL
 *   revoked_at  TIMESTAMPTZ NOT NULL DEFAULT now()
 *
 * @module @sint/persistence-postgres/pg-revocation-store
 */

import type { UUIDv7 } from "@sint/core";
import type { PgPool } from "./pg-pool.js";

/** A stored revocation record. */
export interface RevocationRecord {
  readonly tokenId: UUIDv7;
  readonly reason: string;
  readonly revokedBy: string;
  readonly revokedAt: string;
}

/** Result type for revocation check. */
export type RevocationCheckResult =
  | { ok: true }
  | { ok: false; reason: string; revokedBy: string; revokedAt: string };

/**
 * PostgreSQL-backed revocation store.
 *
 * Revocations are permanent: a token_id can never be un-revoked.
 * Uses INSERT … ON CONFLICT DO NOTHING to make revoke() idempotent.
 */
export class PgRevocationStore {
  constructor(private readonly pool: PgPool) {}

  /**
   * Revoke a token. Idempotent — revoking an already-revoked token is a no-op.
   *
   * @param tokenId  - UUID of the capability token to revoke
   * @param reason   - Human-readable reason for revocation
   * @param revokedBy - Identity of the operator/system that triggered revocation
   */
  async revoke(tokenId: UUIDv7, reason: string, revokedBy: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO sint_revocations (token_id, reason, revoked_by, revoked_at)
       VALUES ($1, $2, $3, now()::timestamptz)
       ON CONFLICT (token_id) DO NOTHING`,
      [tokenId, reason, revokedBy],
    );
  }

  /**
   * Check whether a token has been revoked.
   *
   * Returns `{ ok: true }` if the token is valid (not revoked),
   * or `{ ok: false, reason, revokedBy, revokedAt }` if it is revoked.
   */
  async checkRevocation(tokenId: UUIDv7): Promise<RevocationCheckResult> {
    const result = await this.pool.query(
      "SELECT reason, revoked_by, revoked_at FROM sint_revocations WHERE token_id = $1",
      [tokenId],
    );

    if (result.rows.length === 0) {
      return { ok: true };
    }

    const row = result.rows[0] as Record<string, unknown>;
    return {
      ok: false,
      reason: String(row["reason"]),
      revokedBy: String(row["revoked_by"]),
      revokedAt: String(row["revoked_at"]),
    };
  }

  /**
   * Fetch the full revocation record for a token.
   *
   * @returns The record, or `undefined` if the token has not been revoked.
   */
  async getRevocationRecord(tokenId: UUIDv7): Promise<RevocationRecord | undefined> {
    const result = await this.pool.query(
      "SELECT token_id, reason, revoked_by, revoked_at FROM sint_revocations WHERE token_id = $1",
      [tokenId],
    );

    if (result.rows.length === 0) return undefined;

    const row = result.rows[0] as Record<string, unknown>;
    return {
      tokenId: String(row["token_id"]) as UUIDv7,
      reason: String(row["reason"]),
      revokedBy: String(row["revoked_by"]),
      revokedAt: String(row["revoked_at"]),
    };
  }
}
