/**
 * SINT Protocol — NIST-style Chain-of-Custody Proofs.
 *
 * Proves that event E occurred at position N in the hash chain and
 * that the chain is unbroken from genesis to E.
 *
 * This is analogous to a Merkle proof but for a linear hash chain.
 *
 * @module @sint/gate-evidence-ledger/chain-of-custody
 */

import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import type { SintLedgerEvent } from "@pshkv/core";

export interface ChainOfCustodyProof {
  readonly eventId: string;
  /** SHA-256 of the target event (all fields except hash). */
  readonly eventHash: string;
  /** 0-indexed position in the chain. */
  readonly chainPosition: number;
  /** Hash of event at position N-1 (genesis hash if N=0). */
  readonly precedingHash: string;
  readonly verificationSteps: Array<{
    position: number;
    eventId: string;
    hash: string;
    valid: boolean;
  }>;
  readonly proofValid: boolean;
  /** ISO 8601 timestamp of proof generation. */
  readonly generatedAt: string;
}

/** Genesis hash sentinel. */
const GENESIS_HASH =
  "0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Recompute the SHA-256 hash of a ledger event (excluding its hash field).
 * Must match the logic in writer.ts for consistency.
 */
function recomputeHash(event: SintLedgerEvent): string {
  const canonical = JSON.stringify({
    eventId: event.eventId,
    sequenceNumber: event.sequenceNumber.toString(),
    timestamp: event.timestamp,
    eventType: event.eventType,
    agentId: event.agentId,
    tokenId: event.tokenId,
    payload: event.payload,
    previousHash: event.previousHash,
  });
  const bytes = new TextEncoder().encode(canonical);
  return bytesToHex(sha256(bytes));
}

/**
 * Generate a chain-of-custody proof for a specific event.
 *
 * Walks the chain from genesis to the target event, verifying each link.
 * Returns undefined if the targetEventId is not found in the chain.
 */
export function generateProof(
  events: SintLedgerEvent[],
  targetEventId: string,
): ChainOfCustodyProof | undefined {
  // Sort by sequence number to ensure correct ordering
  const sorted = [...events].sort((a, b) =>
    a.sequenceNumber < b.sequenceNumber ? -1 : 1,
  );

  const targetIndex = sorted.findIndex((e) => e.eventId === targetEventId);
  if (targetIndex === -1) return undefined;

  const verificationSteps: ChainOfCustodyProof["verificationSteps"] = [];
  let expectedPreviousHash = GENESIS_HASH;
  let proofValid = true;

  // Walk the chain from genesis to the target event (inclusive)
  for (let i = 0; i <= targetIndex; i++) {
    const event = sorted[i]!;
    const recomputed = recomputeHash(event);
    const linkValid =
      recomputed === event.hash && event.previousHash === expectedPreviousHash;

    verificationSteps.push({
      position: i,
      eventId: event.eventId,
      hash: event.hash,
      valid: linkValid,
    });

    if (!linkValid) proofValid = false;
    expectedPreviousHash = event.hash;
  }

  const targetEvent = sorted[targetIndex]!;
  const precedingHash =
    targetIndex === 0 ? GENESIS_HASH : sorted[targetIndex - 1]!.hash;

  const generatedAt = new Date()
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");

  return {
    eventId: targetEvent.eventId,
    eventHash: targetEvent.hash,
    chainPosition: targetIndex,
    precedingHash,
    verificationSteps,
    proofValid,
    generatedAt,
  };
}

/**
 * Verify a chain-of-custody proof against the actual event.
 *
 * Checks that:
 * 1. The proof's eventHash matches the event's actual hash
 * 2. The event's recomputed hash matches its stored hash
 * 3. All verification steps in the proof reported valid
 */
export function verifyProof(
  proof: ChainOfCustodyProof,
  event: SintLedgerEvent,
): boolean {
  // The proof must reference this event
  if (proof.eventId !== event.eventId) return false;

  // The event's stored hash must match the proof's recorded hash
  if (proof.eventHash !== event.hash) return false;

  // Recompute the event hash and verify it matches
  const recomputed = recomputeHash(event);
  if (recomputed !== event.hash) return false;

  // All verification steps must have been valid
  if (!proof.proofValid) return false;
  if (proof.verificationSteps.some((step) => !step.valid)) return false;

  return true;
}
