/**
 * SINT Persistence — PostgreSQL Token Store.
 *
 * The full canonical token is persisted in a single JSONB `payload` column
 * so new optional fields on `SintCapabilityToken` (modelConstraints,
 * attestationRequirements, verifiableComputeRequirements, executionEnvelope,
 * behavioralConstraints, passportId, delegationDepth, revocationEndpoint…)
 * round-trip losslessly and signatures verify. A handful of scalar columns
 * (token_id, subject, issuer, resource, expires_at) is denormalized for
 * indexed lookup only. See #169.
 *
 * @module @sint/persistence/pg-token-store
 */

import type pg from "pg";
import type { SintCapabilityToken, UUIDv7 } from "@pshkv/core";
import type { TokenStore } from "./interfaces.js";

/**
 * Reconstruct a `SintCapabilityToken` from a `sint_tokens` row.
 *
 * The `payload` column is authoritative — scalar columns are denormalized
 * for indexing only, so we ignore them here. `pg` already parses JSONB
 * into a JS object for us.
 */
function rowToToken(row: { payload: unknown }): SintCapabilityToken {
  return row.payload as SintCapabilityToken;
}

export class PgTokenStore implements TokenStore {
  constructor(private readonly pool: pg.Pool) {}

  async store(token: SintCapabilityToken): Promise<void> {
    await this.pool.query(
      `INSERT INTO sint_tokens
        (token_id, issuer, subject, resource, expires_at, payload)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (token_id) DO UPDATE SET
         issuer = EXCLUDED.issuer,
         subject = EXCLUDED.subject,
         resource = EXCLUDED.resource,
         expires_at = EXCLUDED.expires_at,
         payload = EXCLUDED.payload`,
      [
        token.tokenId,
        token.issuer,
        token.subject,
        token.resource,
        token.expiresAt,
        JSON.stringify(token),
      ],
    );
  }

  async get(tokenId: UUIDv7): Promise<SintCapabilityToken | undefined> {
    const result = await this.pool.query(
      "SELECT payload FROM sint_tokens WHERE token_id = $1",
      [tokenId],
    );
    return result.rows.length > 0 ? rowToToken(result.rows[0]) : undefined;
  }

  async getBySubject(subject: string): Promise<readonly SintCapabilityToken[]> {
    const result = await this.pool.query(
      "SELECT payload FROM sint_tokens WHERE subject = $1",
      [subject],
    );
    return result.rows.map(rowToToken);
  }

  async remove(tokenId: UUIDv7): Promise<boolean> {
    const result = await this.pool.query(
      "DELETE FROM sint_tokens WHERE token_id = $1",
      [tokenId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async count(): Promise<number> {
    const result = await this.pool.query(
      "SELECT COUNT(*) AS cnt FROM sint_tokens",
    );
    return parseInt(result.rows[0].cnt, 10);
  }
}
