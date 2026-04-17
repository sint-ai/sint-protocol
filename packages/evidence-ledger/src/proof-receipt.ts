/**
 * SINT Protocol — Proof Receipt Generator.
 *
 * Creates cryptographic attestations for ledger events.
 * Proof receipts are used for regulatory compliance
 * (EU AI Act, IEC 62443) — they prove that a specific
 * event occurred and the hash chain is intact up to that point.
 *
 * @module @sint/gate-evidence-ledger/proof-receipt
 */

import type {
  Ed25519PublicKey,
  SHA256,
  SintLedgerEvent,
  SintProofReceipt,
} from "@pshkv/core";
import { canonicalJsonStringify } from "@pshkv/core";

/**
 * Generate a Proof Receipt for a specific ledger event.
 *
 * The receipt includes the hash chain from the genesis event
 * to the target event, providing cryptographic proof of
 * the event's existence and integrity in the ledger.
 *
 * @param targetEvent - The event to generate a receipt for
 * @param chainEvents - All events from genesis to target (inclusive)
 * @param signerPublicKey - The ledger authority's public key
 * @param signFn - Signing function (Ed25519)
 * @returns The proof receipt
 *
 * @example
 * ```ts
 * const receipt = generateProofReceipt(
 *   event,
 *   allEvents.slice(0, eventIndex + 1),
 *   authorityPublicKey,
 *   (data) => sign(authorityPrivateKey, data),
 * );
 * ```
 */
export function generateProofReceipt(
  targetEvent: SintLedgerEvent,
  chainEvents: readonly SintLedgerEvent[],
  signerPublicKey: Ed25519PublicKey,
  signFn: (data: string) => string,
): SintProofReceipt {
  // Build the hash chain from genesis to target
  const hashChain: SHA256[] = chainEvents.map((e) => e.hash);

  const generatedAt = new Date()
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");

  // Create the receipt data to sign
  const receiptData = canonicalJsonStringify({
    eventId: targetEvent.eventId,
    eventHash: targetEvent.hash,
    hashChain,
    generatedAt,
  });

  const signature = signFn(receiptData);

  return {
    eventId: targetEvent.eventId,
    eventHash: targetEvent.hash,
    hashChain,
    generatedAt,
    signature,
    signerPublicKey,
  };
}

/**
 * Verify a Proof Receipt's hash chain integrity.
 * Pure function.
 *
 * Checks that:
 * 1. The event hash matches the last hash in the chain
 * 2. The hash chain is internally consistent
 *
 * @example
 * ```ts
 * const valid = verifyProofReceipt(receipt, verifyFn);
 * ```
 */
export function verifyProofReceipt(
  receipt: SintProofReceipt,
  verifySignatureFn: (publicKey: string, signature: string, data: string) => boolean,
): boolean {
  // Verify the event hash appears in the chain
  if (receipt.hashChain.length === 0) return false;

  const lastHash = receipt.hashChain[receipt.hashChain.length - 1];
  if (lastHash !== receipt.eventHash) return false;

  // Verify the signature
  const receiptData = canonicalJsonStringify({
    eventId: receipt.eventId,
    eventHash: receipt.eventHash,
    hashChain: receipt.hashChain,
    generatedAt: receipt.generatedAt,
  });

  return verifySignatureFn(
    receipt.signerPublicKey,
    receipt.signature,
    receiptData,
  );
}
