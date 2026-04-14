/**
 * SINT Protocol — Capability Token Revocation.
 *
 * Provides real-time token revocation via an in-memory revocation set
 * and integration point for ConsentPass-based distributed revocation.
 *
 * Key invariant: A revoked token MUST fail validation within 1 second.
 * There is NO grace period for revoked tokens.
 *
 * @module @sint/gate-capability-tokens/revocation
 */

import {
  type CapabilityTokenError,
  type ISO8601,
  type Result,
  type UUIDv7,
  err,
  ok,
} from "@pshkv/core";
import { nowISO8601 } from "./utils.js";

/**
 * A revocation record for a single token.
 */
export interface RevocationRecord {
  readonly tokenId: UUIDv7;
  readonly revokedAt: ISO8601;
  readonly reason: string;
  readonly revokedBy: string;
}

/**
 * In-memory revocation store.
 *
 * In production, this would be backed by Redis or a distributed
 * data structure for sub-second propagation across nodes.
 * The in-memory implementation satisfies the < 1 second requirement
 * for single-node deployments.
 */
export class RevocationStore {
  private readonly revoked = new Map<UUIDv7, RevocationRecord>();

  /**
   * Revoke a token immediately.
   *
   * @example
   * ```ts
   * const store = new RevocationStore();
   * store.revoke("token-uuid", "Security incident", "admin-key");
   * ```
   */
  revoke(tokenId: UUIDv7, reason: string, revokedBy: string): void {
    this.revoked.set(tokenId, {
      tokenId,
      revokedAt: nowISO8601(),
      reason,
      revokedBy,
    });
  }

  /**
   * Check if a token has been revoked.
   * Returns ok(true) if the token is NOT revoked (valid).
   * Returns err("TOKEN_REVOKED") if the token IS revoked.
   *
   * @example
   * ```ts
   * const result = store.checkRevocation("token-uuid");
   * if (!result.ok) console.error("Token revoked!");
   * ```
   */
  checkRevocation(tokenId: UUIDv7): Result<true, CapabilityTokenError> {
    if (this.revoked.has(tokenId)) {
      return err("TOKEN_REVOKED");
    }
    return ok(true);
  }

  /**
   * Bulk check revocation status for multiple tokens.
   * Efficient for validating delegation chains.
   */
  checkBulkRevocation(
    tokenIds: readonly UUIDv7[],
  ): Result<true, CapabilityTokenError> {
    for (const tokenId of tokenIds) {
      const result = this.checkRevocation(tokenId);
      if (!result.ok) return result;
    }
    return ok(true);
  }

  /**
   * Get the revocation record for a token (if revoked).
   */
  getRevocationRecord(tokenId: UUIDv7): RevocationRecord | undefined {
    return this.revoked.get(tokenId);
  }

  /**
   * Get the count of revoked tokens.
   */
  get size(): number {
    return this.revoked.size;
  }

  /**
   * Clear all revocation records.
   * Only used in testing — never in production.
   */
  clear(): void {
    this.revoked.clear();
  }
}
