/**
 * SINT Protocol — Evidence Ledger Writer.
 *
 * Appends events to the immutable audit log with hash chaining.
 * NO UPDATE or DELETE operations are permitted.
 *
 * Each event includes a SHA-256 hash of the previous event,
 * forming a tamper-evident chain. Any modification to a past
 * event breaks the chain and is detectable.
 *
 * @module @sint/gate-evidence-ledger/writer
 */

import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import type {
  Ed25519PublicKey,
  ISO8601,
  Result,
  SHA256,
  SintEventType,
  SintLedgerEvent,
  UUIDv7,
} from "@pshkv/core";
import { ok, err, canonicalJsonStringify } from "@pshkv/core";
import { randomBytes } from "node:crypto";

/** Genesis hash — the hash chain starts here. */
const GENESIS_HASH: SHA256 =
  "0000000000000000000000000000000000000000000000000000000000000000";

/**
 * Compute SHA-256 hash of an event (excluding the hash field itself).
 * Pure function — deterministic.
 */
function computeEventHash(event: Omit<SintLedgerEvent, "hash">): SHA256 {
  const canonical = canonicalJsonStringify({
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

/** Generate a UUID v7. */
function generateUUIDv7(): UUIDv7 {
  const timestamp = Date.now();
  const timestampBytes = new Uint8Array(6);
  let ts = timestamp;
  for (let i = 5; i >= 0; i--) {
    timestampBytes[i] = ts & 0xff;
    ts = Math.floor(ts / 256);
  }
  const rand = randomBytes(10);
  const bytes = new Uint8Array(16);
  bytes.set(timestampBytes, 0);
  bytes.set(rand, 6);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Get ISO 8601 timestamp with microsecond precision. */
function nowISO8601(): ISO8601 {
  return new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

/**
 * In-memory Evidence Ledger Writer.
 *
 * Maintains an append-only log with hash chaining.
 * In production, this backs to PostgreSQL with immutable row constraints.
 *
 * @example
 * ```ts
 * const writer = new LedgerWriter();
 *
 * const event = writer.append({
 *   eventType: "policy.evaluated",
 *   agentId: "a1b2c3...",
 *   payload: { decision: "allow", tier: "T0_observe" },
 * });
 *
 * console.log(event.sequenceNumber); // 1n
 * console.log(event.hash);           // SHA-256 hash
 * ```
 */
export class LedgerWriter {
  private events: SintLedgerEvent[] = [];
  private sequenceCounter = 0n;
  private lastHash: SHA256 = GENESIS_HASH;

  /**
   * Append an event to the ledger.
   * This is the ONLY write operation. There is no update or delete.
   *
   * @returns The complete event with computed hash and sequence number
   */
  append(input: {
    eventType: SintEventType;
    agentId: Ed25519PublicKey;
    tokenId?: UUIDv7;
    payload: Record<string, unknown>;
  }): SintLedgerEvent {
    this.sequenceCounter += 1n;

    const partialEvent: Omit<SintLedgerEvent, "hash"> = {
      eventId: generateUUIDv7(),
      sequenceNumber: this.sequenceCounter,
      timestamp: nowISO8601(),
      eventType: input.eventType,
      agentId: input.agentId,
      tokenId: input.tokenId,
      payload: input.payload,
      previousHash: this.lastHash,
    };

    const hash = computeEventHash(partialEvent);
    const event: SintLedgerEvent = { ...partialEvent, hash };

    this.events.push(event);
    this.lastHash = hash;

    return event;
  }

  /**
   * Verify the integrity of the hash chain.
   * Returns ok(true) if the entire chain is valid,
   * or err with the index of the first broken link.
   *
   * @example
   * ```ts
   * const result = writer.verifyChain();
   * if (!result.ok) console.error("Chain broken at index:", result.error);
   * ```
   */
  verifyChain(): Result<true, number> {
    let expectedPreviousHash = GENESIS_HASH;

    for (let i = 0; i < this.events.length; i++) {
      const event = this.events[i]!;

      // Check previousHash pointer
      if (event.previousHash !== expectedPreviousHash) {
        return err(i);
      }

      // Recompute and verify hash
      const { hash, ...rest } = event;
      const recomputed = computeEventHash(rest);
      if (recomputed !== hash) {
        return err(i);
      }

      // Check monotonic sequence
      if (event.sequenceNumber !== BigInt(i + 1)) {
        return err(i);
      }

      expectedPreviousHash = hash;
    }

    return ok(true);
  }

  /** Get the total number of events. */
  get length(): number {
    return this.events.length;
  }

  /** Get the last hash in the chain (head of chain). */
  get headHash(): SHA256 {
    return this.lastHash;
  }

  /** Get all events (read-only copy). */
  getAll(): readonly SintLedgerEvent[] {
    return [...this.events];
  }

  /** Get a specific event by sequence number. */
  getBySequence(seq: bigint): SintLedgerEvent | undefined {
    return this.events.find((e) => e.sequenceNumber === seq);
  }
}
