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
  | "safety.hardware.permit.denied"
  | "safety.hardware.interlock.open"
  | "safety.hardware.state.stale"
  // Verifiable compute / provable execution
  | "verifiable.compute.verified"
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
  | "economy.action.billed"
  // Economic (Layer 4) — SLA
  | "sla.bond.slashed"
  // Avatar (Layer 5) — behavioral identity
  | "avatar.profile.created"
  | "avatar.profile.updated"
  | "avatar.csml.escalated"
  // Operator (Layer 5) — memory, voice, HUD, notifications, mode
  | "operator.memory.stored"
  | "operator.memory.recalled"
  | "operator.memory.deleted"
  | "operator.voice.output"
  | "operator.hud.updated"
  | "operator.notification.sent"
  | "operator.mode.changed"
  // Risk scoring — emitted after each intercept with riskScore + csml
  | "risk.score.computed"
  // Ledger management (audit of the auditor)
  | "ledger.exported";

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

  // ROSClaw integration fields — enables cross-system CSML computation
  /** Cross-reference to ROSClaw audit log entry (arXiv:2603.26997). */
  readonly rosclaw_audit_ref?: string;
  /** ROSClaw failure mode if applicable: malformed_params | wrong_action_type | replan_loop */
  readonly rosclaw_failure_mode?: "malformed_params" | "wrong_action_type" | "replan_loop";
  /** Foundation model backend identifier (for CSML per-model behavioral tracking). */
  readonly foundation_model_id?: string;
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

  /**
   * Optional TEE attestation for regulatory-grade proof (required for T2/T3 events).
   * Ensures the event was written within a secure enclave at the stated timestamp,
   * preventing post-hoc insertion or backdating.
   */
  readonly teeAttestation?: {
    readonly teeBackend: "intel-sgx" | "arm-trustzone" | "amd-sev";
    /** TEE-signed attestation quote over the event hash. */
    readonly attestationQuote: string;
    readonly timestamp: ISO8601;
  };
}

/**
 * Stage-specific receipt used for strong-tier flows that need both a gate receipt
 * before execution and a completion receipt after execution settles.
 */
export interface SintBilateralProofReceipt extends SintProofReceipt {
  /** Stable cross-system correlation identifier for the governed action. */
  readonly actionRef: string;
  /** Whether this receipt captures the authorization gate or the execution result. */
  readonly stage: "gate" | "completion";
  /** The paired event on the other side of the gate/completion lifecycle. */
  readonly counterpartEventId: UUIDv7;
  /** Shared deterministic linkage hash tying the pair together. */
  readonly linkageHash: SHA256;
  /** Stage-specific outcome associated with the receipt. */
  readonly outcome: "allow" | "deny" | "escalate" | "completed" | "failed" | "rolledback";
}

/**
 * Linked receipt pair for strong-tier execution governance.
 */
export interface SintBilateralProofReceiptPair {
  /** Receipt emitted at the authorization gate (before execution). */
  readonly gate: SintBilateralProofReceipt;
  /** Receipt emitted at action completion (success, failure, or rollback). */
  readonly completion: SintBilateralProofReceipt;
}

/**
 * Formal DFA states for the SINT request lifecycle.
 *
 * Models physical consequence severity of every request through a deterministic
 * finite automaton. The ACTING state is only reachable via POLICY_EVAL with a valid
 * token (invariant I-G1: No Bypass). The ESTOP transition is universal across all
 * non-terminal states (invariant I-G2: E-stop Universality).
 */
export type RequestLifecycleState =
  | "IDLE"           // Awaiting request
  | "PENDING"        // Request received, validating token
  | "POLICY_EVAL"    // Token valid, evaluating tiers and constraints
  | "ESCALATING"     // T2/T3 tier — awaiting human/operator approval
  | "PLANNING"       // Approved, constructing action plan
  | "OBSERVING"      // Executing T0 observe action (read-only)
  | "PREPARING"      // Executing T1 prepare action (idempotent writes)
  | "ACTING"         // Executing T2 act action (physical state change)
  | "COMMITTING"     // Executing T3 commit action, writing to ledger
  | "COMPLETED"      // Action completed and ledger record confirmed
  | "FAILED"         // Token invalid, approval denied, or execution failure
  | "ROLLEDBACK";    // E-stop or execution failure — returned to safe state

/**
 * SINT Bridge per-topic/per-resource authorization state machine.
 *
 * Each external protocol surface (ROS 2 topic, MCP server, A2A agent) maintains
 * an independent state. Only the ACTIVE state allows messages to traverse the bridge.
 * Revocation immediately transitions ACTIVE → SUSPENDED without node restart.
 */
export type BridgeAdapterState =
  | "UNREGISTERED"   // No active authorization
  | "PENDING_AUTH"   // Capability token presented, validation in progress
  | "AUTHORIZED"     // Token valid, not yet receiving messages
  | "ACTIVE"         // Token valid, messages flowing (only state that forwards)
  | "SUSPENDED";     // Revocation event received — messages blocked, re-auth possible

/**
 * CSML (Composite Safety-Model Latency) metric coefficients.
 *
 * Quantifies the interaction between model behavioral safety and physical
 * authorization layers into a single auditable score per deployment.
 * Computed from Evidence Ledger data + ROSClaw audit cross-references.
 *
 * Lower CSML is better. Above threshold θ → automatic tier escalation.
 */
export interface CsmlCoefficients {
  /** Weight for Attempt Rate AR_m ∈ [0,1]: fraction of adversarial prompts eliciting ≥1 validator block */
  readonly alpha: number;
  /** Weight for mean Blocks Per prompt BP_m ≥ 0 */
  readonly beta: number;
  /** Weight for median overspeed Severity SV_m ≥ 1 */
  readonly gamma: number;
  /** Weight (negated) for task Completion Rate CR_m ∈ [0,1] */
  readonly delta: number;
  /** Weight for ledger_intact indicator: 1 if Evidence Ledger hash chain verified intact */
  readonly epsilon: number;
}

/** Default CSML coefficients per the SINT formal specification. */
export const DEFAULT_CSML_COEFFICIENTS: CsmlCoefficients = {
  alpha: 0.4,
  beta: 0.2,
  gamma: 0.2,
  delta: 0.1,
  epsilon: 0.1,
} as const;

/**
 * Query parameters for reading from the Evidence Ledger.
 */
export interface LedgerQuery {
  /** Restrict results to events emitted for this agent. */
  readonly agentId?: Ed25519PublicKey;
  /** Restrict results to a specific event type. */
  readonly eventType?: SintEventType;
  /** Inclusive lower bound on `sequenceNumber`. */
  readonly fromSequence?: bigint;
  /** Inclusive upper bound on `sequenceNumber`. */
  readonly toSequence?: bigint;
  /** Inclusive lower bound on `timestamp` (ISO 8601). */
  readonly fromTimestamp?: ISO8601;
  /** Inclusive upper bound on `timestamp` (ISO 8601). */
  readonly toTimestamp?: ISO8601;
  /** Maximum number of events to return. */
  readonly limit?: number;
  /** Number of matching events to skip (paging). */
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
