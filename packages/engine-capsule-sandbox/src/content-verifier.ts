/**
 * SINT Protocol — Capsule content hash verification.
 *
 * Computes a SHA-256 hash of capsule content and compares it against
 * the expected hash declared in the manifest. Uses `@noble/hashes`
 * for audited, zero-dependency hashing.
 *
 * @module @sint/engine-capsule-sandbox/content-verifier
 */

import type { Result } from "@sint-ai/core";
import { ok, err } from "@sint-ai/core";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import type { CapsuleError } from "./types.js";

/**
 * Verify that the SHA-256 hash of `content` matches `expectedHash`.
 *
 * @param content      - Raw capsule bundle bytes.
 * @param expectedHash - Hex-encoded SHA-256 hash from the manifest.
 * @returns `ok(true)` if hashes match, `err(CapsuleError)` with code
 *          `HASH_MISMATCH` if they differ.
 *
 * @example
 * ```ts
 * import { verifyContentHash } from "@sint-ai/engine-capsule-sandbox";
 * import { sha256 } from "@noble/hashes/sha2";
 * import { bytesToHex } from "@noble/hashes/utils";
 *
 * const content = new Uint8Array([1, 2, 3]);
 * const hash = bytesToHex(sha256(content));
 * const result = verifyContentHash(content, hash);
 * // result.ok === true
 * ```
 */
export function verifyContentHash(
  content: Uint8Array,
  expectedHash: string,
): Result<true, CapsuleError> {
  const computedHash = bytesToHex(sha256(content));

  if (computedHash !== expectedHash) {
    return err({
      code: "HASH_MISMATCH",
      message: `Content hash mismatch: expected ${expectedHash}, got ${computedHash}`,
    });
  }

  return ok(true);
}
