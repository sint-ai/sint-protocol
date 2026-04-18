/**
 * SINT Protocol — W3C DID Identity Utilities.
 *
 * Implements the `did:key` method for Ed25519 public keys as specified by:
 *   https://w3c-ccg.github.io/did-method-key/
 *
 * Format: `did:key:z6Mk<base58btc-encoded multicodec key>`
 *
 * Encoding:
 *   1. Prepend multicodec prefix [0xed, 0x01] (ed25519-pub) to the 32-byte key
 *   2. Encode the 34-byte result using base58btc
 *   3. Prepend 'z' (multibase base58btc indicator)
 *   4. Prepend 'did:key:'
 *
 * This allows SINT Ed25519 agent keys to be used as W3C DIDs, enabling
 * interoperability with the W3C DID/Verifiable Credential ecosystem.
 *
 * @module @sint/gate-capability-tokens/did
 */

import { hexToBytes } from "@noble/hashes/utils";
import type { Ed25519PublicKey } from "@sint-ai/core";

// Base58btc alphabet (Bitcoin alphabet, no 0/O/I/l)
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

// Ed25519-pub multicodec prefix (varint-encoded 0xed01)
const ED25519_PUB_PREFIX = new Uint8Array([0xed, 0x01]);

/** Encode bytes to base58btc string. */
function toBase58(bytes: Uint8Array): string {
  let num = BigInt(0);
  for (const byte of bytes) {
    num = num * BigInt(256) + BigInt(byte);
  }

  let result = "";
  while (num > BigInt(0)) {
    result = BASE58_ALPHABET[Number(num % BigInt(58))]! + result;
    num = num / BigInt(58);
  }

  // Leading zero bytes → leading '1's
  for (const byte of bytes) {
    if (byte !== 0) break;
    result = "1" + result;
  }

  return result;
}

/** Decode base58btc string to bytes. */
function fromBase58(str: string): Uint8Array {
  let num = BigInt(0);
  for (const char of str) {
    const idx = BASE58_ALPHABET.indexOf(char);
    if (idx < 0) throw new Error(`Invalid base58 character: ${char}`);
    num = num * BigInt(58) + BigInt(idx);
  }

  const bytes: number[] = [];
  while (num > BigInt(0)) {
    bytes.unshift(Number(num % BigInt(256)));
    num = num / BigInt(256);
  }

  // Leading '1's → leading zero bytes
  for (const char of str) {
    if (char !== "1") break;
    bytes.unshift(0);
  }

  return new Uint8Array(bytes);
}

/**
 * Convert a SINT Ed25519 public key (hex) to a W3C `did:key:` identifier.
 *
 * @example
 * ```ts
 * const did = keyToDid("a1b2c3...");
 * // "did:key:z6Mk..."
 * ```
 */
export function keyToDid(publicKey: Ed25519PublicKey): string {
  const keyBytes = hexToBytes(publicKey);
  if (keyBytes.length !== 32) {
    throw new Error(`Ed25519 public key must be 32 bytes, got ${keyBytes.length}`);
  }

  // Prepend multicodec prefix
  const multicodecKey = new Uint8Array(ED25519_PUB_PREFIX.length + keyBytes.length);
  multicodecKey.set(ED25519_PUB_PREFIX, 0);
  multicodecKey.set(keyBytes, ED25519_PUB_PREFIX.length);

  // base58btc encode + multibase prefix 'z'
  return `did:key:z${toBase58(multicodecKey)}`;
}

/**
 * Parse a `did:key:` DID back to a SINT Ed25519 public key (hex).
 *
 * Returns `undefined` if the DID is not a valid `did:key:` with an
 * Ed25519 public key.
 *
 * @example
 * ```ts
 * const pubkey = didToKey("did:key:z6Mk...");
 * // "a1b2c3..."
 * ```
 */
export function didToKey(did: string): Ed25519PublicKey | undefined {
  if (!did.startsWith("did:key:z")) return undefined;

  const encoded = did.slice("did:key:z".length);
  let decoded: Uint8Array;
  try {
    decoded = fromBase58(encoded);
  } catch {
    return undefined;
  }

  // Verify multicodec prefix
  if (decoded.length < ED25519_PUB_PREFIX.length + 32) return undefined;
  if (decoded[0] !== ED25519_PUB_PREFIX[0] || decoded[1] !== ED25519_PUB_PREFIX[1]) {
    return undefined;
  }

  // Extract 32-byte key
  const keyBytes = decoded.slice(ED25519_PUB_PREFIX.length);
  if (keyBytes.length !== 32) return undefined;

  return Array.from(keyBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Check whether a string is a valid SINT `did:key:` identifier
 * with an Ed25519 public key.
 */
export function isValidDid(value: string): boolean {
  return didToKey(value) !== undefined;
}
