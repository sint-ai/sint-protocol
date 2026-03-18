/**
 * SINT Protocol — Evidence Ledger types.
 *
 * The Evidence Ledger is an append-only, immutable log of every action,
 * decision, approval, and outcome. It is the "black box flight recorder"
 * for robots. NO UPDATE or DELETE operations are permitted.
 *
 * @module @sint/core/types/evidence
 */

import type {
  Ed25519PublicKey,
  Ed25519Signature,
  ISO8601,
  SHA256,
  UUIDv7,
} from "./primitives.js";

/**
 * All event types in the SINT Evidence Ledger.
 * Uses dot-notation domain events per naming convention.
 */
export type SintEventType =
  // Lifecycle
  | "agent.registered"
  | "agent.capability.granted"
  | "agent.capability.revoked"
  // Request/response
  | "request.received"
  | "policy.evaluated"
  | "approval.requested"
  | "approval.granted"
  | "approval.denied"
  | "approval.timeout"
  // Execution
  | "action.started"
  | "action.completed"
  | "action.failed"
  | "action.rolledback"
  // Safety — unique to physical AI
  | "safety.estop.triggered"
  | "safety.geofence.violation"
  | "safety.force.exceeded"
  | "safety.human.detected"
  | "safety.anomaly.detected"
  // Token management
  | "token.issued"
  | "token.revoked"
  | "token.delegated"
  // Engine — System 1 (Neural Perception)
  | "engine.system1.inference"
  | "engine.system1.anomaly"
  // Engine — System 2 (Symbolic Reasoning)
  | "engine.system2.plan.created"
  | "engine.system2.plan.validated"
  | "engine.system2.plan.step.executed"
  | "engine.system2.tick"
  // Engine — Arbitration
  | "engine.arbitration.decided"
  | "engine.arbitration.override"
  | "engine.arbitration.escalated"
  // Engine — Capsule Sandbox
  | "capsule.loaded"
  | "capsule.validated"
  | "capsule.executed"
  | "capsule.unloaded"
  | "capsule.resource.exceeded"
  // Engine — Hardware Abstraction Layer
  | "hal.hardware.detected"
  | "hal.profile.selected"
  // Economic (Layer 4) — Marketplace
  | "capsule.purchased"
  | "task.bid.placed"
  | "payment.settled"
  // Economic (Layer 4) — Balance
  | "economy.balance.checked"
  | "economy.balance.deducted"
  | "economy.balance.insufficient"
  // Economic (Layer 4) — Budget
  | "economy.budget.checked"
  | "economy.budget.exceeded"
  | "economy.budget.alert"
  // Economic (Layer 4) — Trust & Billing
  | "economy.trust.evaluated"
  | "economy.trust.blocked"
  | "economy.action.billed";

/**
 * A single immutable event in the Evidence Ledger.
 *
 * Events form a hash chain — each event includes the SHA-256 hash
 * of the previous event, providing tamper-evident integrity.
 *
 * @example
 * ```ts
 * const event: SintLedgerEvent = {
 *   eventId: "01905f7c-...",
 *   sequenceNumber: 42n,
 *   timestamp: "2026-03-16T10:00:00.000000Z",
 *   eventType: "policy.evaluated",
 *   agentId: "a1b2c3...",
 *   tokenId: "01905f7c-...",
 *   payload: { decision: "allow", tier: "T0_observe" },
 *   previousHash: "abc123...",
 *   hash: "def456...",
 * };
 * ```
 */
export interface SintLedgerEvent {
  /** Unique event identifier (UUID v7). */
  readonly eventId: UUIDv7;

  /** Monotonic sequence number for total ordering. */
  readonly sequenceNumber: bigint;

  /** ISO 8601 timestamp with microsecond precision in UTC. */
  readonly timestamp: ISO8601;

  /** Event type from the enumerated set. */
  readonly eventType: SintEventType;

  /** Agent identity (Ed25519 public key). */
  readonly agentId: Ed25519PublicKey;

  /** Capability token used for this action (if applicable). */
  readonly tokenId?: UUIDv7;

  /** Event-specific payload data. */
  readonly payload: Record<string, unknown>;

  /** SHA-256 hash of the previous event (chain integrity). */
  readonly previousHash: SHA256;

  /** SHA-256 hash of this event (computed over all fields above). */
  readonly hash: SHA256;
}

/**
 * A ProofReceipt provides cryptographic attestation of a ledger event.
 * Used for regulatory compliance (EU AI Act, IEC 62443).
 */
export interface SintProofReceipt {
  /** The event this receipt attests to. */
  readonly eventId: UUIDv7;

  /** The ledger event's hash. */
  readonly eventHash: SHA256;

  /** The sequence of hashes from this event to a trust anchor. */
  readonly hashChain: readonly SHA256[];

  /** Timestamp of receipt generation. */
  readonly generatedAt: ISO8601;

  /** Signature over the receipt by the ledger authority. */
  readonly signature: Ed25519Signature;

  /** Public key of the signing authority. */
  readonly signerPublicKey: Ed25519PublicKey;
}

/**
 * Query parameters for reading from the Evidence Ledger.
 */
export interface LedgerQuery {
  readonly agentId?: Ed25519PublicKey;
  readonly eventType?: SintEventType;
  readonly fromSequence?: bigint;
  readonly toSequence?: bigint;
  readonly fromTimestamp?: ISO8601;
  readonly toTimestamp?: ISO8601;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Retention tiers for evidence data.
 * Higher severity events are retained longer.
 */
export const RETENTION_DAYS: Record<string, number> = {
  T0_observe: 30,
  T1_prepare: 90,
  T2_act: 180,
  T3_commit: 365,
} as const;
