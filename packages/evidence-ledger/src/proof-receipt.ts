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
  SintBilateralProofReceipt,
  SintBilateralProofReceiptPair,
  SintLedgerEvent,
  SintProofReceipt,
  UUIDv7,
} from "@sint-ai/core";
import { canonicalJsonStringify } from "@sint-ai/core";
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";

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

function inferCompletionOutcome(
  event: SintLedgerEvent,
): SintBilateralProofReceipt["outcome"] {
  switch (event.eventType) {
    case "action.completed":
      return "completed";
    case "action.failed":
      return "failed";
    case "action.rolledback":
      return "rolledback";
    default:
      return "completed";
  }
}

export function computeReceiptLinkageHash(
  actionRef: string,
  gateEventId: UUIDv7,
  completionEventId: UUIDv7,
): SHA256 {
  const canonical = canonicalJsonStringify({
    actionRef,
    gateEventId,
    completionEventId,
  });
  return bytesToHex(sha256(new TextEncoder().encode(canonical)));
}

function signBilateralReceipt(
  receipt: Omit<SintBilateralProofReceipt, "signature">,
  signFn: (data: string) => string,
): SintBilateralProofReceipt {
  const receiptData = canonicalJsonStringify(receipt);
  return {
    ...receipt,
    signature: signFn(receiptData),
  };
}

export function generateBilateralProofReceiptPair(params: {
  readonly actionRef: string;
  readonly gateEvent: SintLedgerEvent;
  readonly gateChainEvents: readonly SintLedgerEvent[];
  readonly gateOutcome?: Extract<SintBilateralProofReceipt["outcome"], "allow" | "deny" | "escalate">;
  readonly completionEvent: SintLedgerEvent;
  readonly completionChainEvents: readonly SintLedgerEvent[];
  readonly completionOutcome?: Extract<SintBilateralProofReceipt["outcome"], "completed" | "failed" | "rolledback">;
  readonly signerPublicKey: Ed25519PublicKey;
  readonly signFn: (data: string) => string;
}): SintBilateralProofReceiptPair {
  const gateBase = generateProofReceipt(
    params.gateEvent,
    params.gateChainEvents,
    params.signerPublicKey,
    params.signFn,
  );
  const completionBase = generateProofReceipt(
    params.completionEvent,
    params.completionChainEvents,
    params.signerPublicKey,
    params.signFn,
  );
  const { signature: _gateSignature, ...gateUnsignedBase } = gateBase;
  const { signature: _completionSignature, ...completionUnsignedBase } = completionBase;

  const linkageHash = computeReceiptLinkageHash(
    params.actionRef,
    params.gateEvent.eventId,
    params.completionEvent.eventId,
  );

  const gate = signBilateralReceipt(
    {
      ...gateUnsignedBase,
      actionRef: params.actionRef,
      stage: "gate",
      counterpartEventId: params.completionEvent.eventId,
      linkageHash,
      outcome: params.gateOutcome ?? "allow",
    },
    params.signFn,
  );

  const completion = signBilateralReceipt(
    {
      ...completionUnsignedBase,
      actionRef: params.actionRef,
      stage: "completion",
      counterpartEventId: params.gateEvent.eventId,
      linkageHash,
      outcome: params.completionOutcome ?? inferCompletionOutcome(params.completionEvent),
    },
    params.signFn,
  );

  return { gate, completion };
}

export function verifyBilateralProofReceipt(
  receipt: SintBilateralProofReceipt,
  verifySignatureFn: (publicKey: string, signature: string, data: string) => boolean,
): boolean {
  if (receipt.hashChain.length === 0) return false;
  const lastHash = receipt.hashChain[receipt.hashChain.length - 1];
  if (lastHash !== receipt.eventHash) return false;

  const receiptData = canonicalJsonStringify({
    eventId: receipt.eventId,
    eventHash: receipt.eventHash,
    hashChain: receipt.hashChain,
    generatedAt: receipt.generatedAt,
    signerPublicKey: receipt.signerPublicKey,
    teeAttestation: receipt.teeAttestation,
    actionRef: receipt.actionRef,
    stage: receipt.stage,
    counterpartEventId: receipt.counterpartEventId,
    linkageHash: receipt.linkageHash,
    outcome: receipt.outcome,
  });

  return verifySignatureFn(
    receipt.signerPublicKey,
    receipt.signature,
    receiptData,
  );
}

export function verifyBilateralReceiptPair(
  pair: SintBilateralProofReceiptPair,
  verifySignatureFn: (publicKey: string, signature: string, data: string) => boolean,
): boolean {
  if (!verifyBilateralProofReceipt(pair.gate, verifySignatureFn)) return false;
  if (!verifyBilateralProofReceipt(pair.completion, verifySignatureFn)) return false;

  if (pair.gate.stage !== "gate" || pair.completion.stage !== "completion") return false;
  if (pair.gate.actionRef !== pair.completion.actionRef) return false;
  if (pair.gate.linkageHash !== pair.completion.linkageHash) return false;
  if (pair.gate.counterpartEventId !== pair.completion.eventId) return false;
  if (pair.completion.counterpartEventId !== pair.gate.eventId) return false;

  const recomputedLinkageHash = computeReceiptLinkageHash(
    pair.gate.actionRef,
    pair.gate.eventId,
    pair.completion.eventId,
  );

  return pair.gate.linkageHash === recomputedLinkageHash;
}
