/**
 * SINT Protocol — Ed25519 cryptographic utilities.
 *
 * Wraps @noble/ed25519 for deterministic, side-effect-free
 * cryptographic operations on capability tokens.
 *
 * @module @sint/gate-capability-tokens/crypto
 */

import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha512";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import type { Ed25519PublicKey, Ed25519Signature, SHA256 } from "@sint-ai/core";

// Configure ed25519 to use sha512
ed25519.etc.sha512Sync = (...m: Uint8Array[]) => {
  const h = sha512.create();
  for (const msg of m) h.update(msg);
  return h.digest();
};

/**
 * Generate a new Ed25519 keypair.
 *
 * @example
 * ```ts
 * const { publicKey, privateKey } = generateKeypair();
 * ```
 */
export function generateKeypair(): {
  publicKey: Ed25519PublicKey;
  privateKey: string;
} {
  const privateKeyBytes = ed25519.utils.randomPrivateKey();
  const publicKeyBytes = ed25519.getPublicKey(privateKeyBytes);
  return {
    publicKey: bytesToHex(publicKeyBytes),
    privateKey: bytesToHex(privateKeyBytes),
  };
}

/**
 * Sign a message with an Ed25519 private key.
 * This is a pure function — deterministic output for the same inputs.
 *
 * @example
 * ```ts
 * const signature = sign("deadbeef...", "Hello, SINT!");
 * ```
 */
export function sign(privateKeyHex: string, message: string): Ed25519Signature {
  const messageBytes = new TextEncoder().encode(message);
  const privateKeyBytes = hexToBytes(privateKeyHex);
  const signatureBytes = ed25519.sign(messageBytes, privateKeyBytes);
  return bytesToHex(signatureBytes);
}

/**
 * Verify an Ed25519 signature.
 * Pure function — no side effects, deterministic.
 *
 * @example
 * ```ts
 * const valid = verify("a1b2c3...", "sig...", "Hello, SINT!");
 * ```
 */
export function verify(
  publicKeyHex: Ed25519PublicKey,
  signatureHex: Ed25519Signature,
  message: string,
): boolean {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const publicKeyBytes = hexToBytes(publicKeyHex);
    const signatureBytes = hexToBytes(signatureHex);
    return ed25519.verify(signatureBytes, messageBytes, publicKeyBytes);
  } catch {
    return false;
  }
}

/**
 * Compute SHA-256 hash of a string.
 *
 * @example
 * ```ts
 * const hash = hashSha256("Hello, SINT!");
 * ```
 */
export function hashSha256(data: string): SHA256 {
  const bytes = new TextEncoder().encode(data);
  return bytesToHex(sha256(bytes));
}

/**
 * Derive the public key from a private key.
 */
export function getPublicKey(privateKeyHex: string): Ed25519PublicKey {
  const privateKeyBytes = hexToBytes(privateKeyHex);
  const publicKeyBytes = ed25519.getPublicKey(privateKeyBytes);
  return bytesToHex(publicKeyBytes);
}
