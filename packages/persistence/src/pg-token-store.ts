/**
 * SINT Persistence — PostgreSQL Token Store.
 *
 * @module @sint/persistence/pg-token-store
 */

import type pg from "pg";
import type { SintCapabilityToken, UUIDv7 } from "@pshkv/core";
import type { TokenStore } from "./interfaces.js";

/** Map a database row to a SintCapabilityToken. */
function rowToToken(row: any): SintCapabilityToken {
  return {
    tokenId: row.token_id,
    issuer: row.issuer,
    subject: row.subject,
    resource: row.resource,
    actions: row.actions,
    constraints: row.constraints,
    delegationChain: row.delegation_chain,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    revocable: row.revocable,
    signature: row.signature,
  };
}

export class PgTokenStore implements TokenStore {
  constructor(private readonly pool: pg.Pool) {}

  async store(token: SintCapabilityToken): Promise<void> {
    await this.pool.query(
      `INSERT INTO sint_tokens
        (token_id, issuer, subject, resource, actions, constraints,
         delegation_chain, issued_at, expires_at, revocable, signature)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (token_id) DO UPDATE SET
         issuer = EXCLUDED.issuer,
         subject = EXCLUDED.subject,
         resource = EXCLUDED.resource,
         actions = EXCLUDED.actions,
         constraints = EXCLUDED.constraints,
         delegation_chain = EXCLUDED.delegation_chain,
         issued_at = EXCLUDED.issued_at,
         expires_at = EXCLUDED.expires_at,
         revocable = EXCLUDED.revocable,
         signature = EXCLUDED.signature`,
      [
        token.tokenId,
        token.issuer,
        token.subject,
        token.resource,
        JSON.stringify(token.actions),
        JSON.stringify(token.constraints),
        JSON.stringify(token.delegationChain),
        token.issuedAt,
        token.expiresAt,
        token.revocable,
        token.signature,
      ],
    );
  }

  async get(tokenId: UUIDv7): Promise<SintCapabilityToken | undefined> {
    const result = await this.pool.query(
      "SELECT * FROM sint_tokens WHERE token_id = $1",
      [tokenId],
    );
    return result.rows.length > 0 ? rowToToken(result.rows[0]) : undefined;
  }

  async getBySubject(subject: string): Promise<readonly SintCapabilityToken[]> {
    const result = await this.pool.query(
      "SELECT * FROM sint_tokens WHERE subject = $1",
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
