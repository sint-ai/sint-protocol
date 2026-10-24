/**
 * Cryptographically bound evidence produced by a predictive simulation service.
 *
 * A receipt is evidence for policy evaluation, not an execution authorization.
 * The Policy Gateway remains the sole authorization choke point.
 */

import type {
  ApprovalTier,
} from "./policy.js";
import type {
  Ed25519PublicKey,
  Ed25519Signature,
  ISO8601,
  Result,
  SHA256,
  UUIDv7,
} from "./primitives.js";

/** Increasing fidelity levels understood by the policy matrix. */
export type SimulationEvidenceGrade = "deterministic" | "physics" | "digital-twin";

/** Optional physical/deployment identities that a receipt can bind. */
export interface SimulationSubjectBindings {
  readonly robotId?: string;
  readonly toolId?: string;
  readonly payloadDigest?: SHA256;
  readonly controllerId?: string;
  readonly cellId?: string;
  readonly policyDigest?: SHA256;
}

/** Tier-selected evidence requirements returned during non-authorizing preflight. */
export interface SimulationEvidenceRequirement {
  readonly minEvidenceGrade: SimulationEvidenceGrade;
  readonly minScenarioRuns?: number;
  readonly minScenarioCoverage?: number;
  readonly maxWorldUncertainty?: number;
  readonly allowedBackends?: readonly string[];
  readonly requiredBindings?: readonly (keyof SimulationSubjectBindings)[];
  /** Exact deployment identities/digests the receipt must carry. */
  readonly expectedBindings?: Partial<SimulationSubjectBindings>;
  /** Minimum M-of-N human approval threshold required after evidence passes. */
  readonly minApprovalQuorum?: number;
  readonly reason?: string;
}

/** Canonical action plan submitted to an EffectSimulator implementation. */
export interface EffectPlan {
  readonly requestDigest: SHA256;
  readonly effectPlanDigest: SHA256;
  readonly tokenDigest: SHA256;
  readonly resource: string;
  readonly action: string;
  readonly params: Record<string, unknown>;
}

/** Advisory output only. It cannot authorize or execute an action. */
export interface SimulationPreflight {
  readonly kind: "simulation-preflight";
  readonly authorizesExecution: false;
  readonly assignedTier: ApprovalTier;
  readonly effectPlan: EffectPlan;
  readonly requirement?: SimulationEvidenceRequirement;
}

export type EffectSimulationErrorCode =
  | "INVALID_PREFLIGHT"
  | "UNSUPPORTED_EVIDENCE_GRADE"
  | "WORLD_SNAPSHOT_REQUIRED"
  | "WORLD_SNAPSHOT_STALE"
  | "ARTIFACT_PERSISTENCE_FAILED"
  | "EVIDENCE_LEDGER_WRITE_FAILED"
  | "SIMULATOR_MISCONFIGURED"
  | "SIMULATION_FAILED";

/** Operational failure of a simulator, distinct from a signed unsafe result. */
export interface EffectSimulationError {
  readonly code: EffectSimulationErrorCode;
  readonly message: string;
  readonly retryable: boolean;
}

export interface SimulationArtifact {
  readonly mediaType: string;
  readonly content: string;
}

export interface StoredSimulationArtifact {
  readonly digest: SHA256;
  readonly mediaType: string;
  readonly sizeBytes: number;
}

export interface SimulationArtifactStoreError {
  readonly code: "ARTIFACT_WRITE_FAILED" | "ARTIFACT_READ_FAILED" | "ARTIFACT_NOT_FOUND" | "ARTIFACT_CORRUPTED";
  readonly message: string;
}

/** Backend-neutral durable store for world state and simulation traces. */
export interface SimulationArtifactStore {
  put(artifact: SimulationArtifact): Promise<Result<StoredSimulationArtifact, SimulationArtifactStoreError>>;
  get(digest: SHA256): Promise<Result<SimulationArtifact, SimulationArtifactStoreError>>;
}

export interface SimulationReceiptRecorderError {
  readonly code: "EVIDENCE_LEDGER_WRITE_FAILED";
  readonly message: string;
}

/** Append-only audit boundary a simulator must cross before returning a receipt. */
export interface SimulationReceiptRecorder {
  recordIssued(
    receipt: SimulationEvidenceReceipt,
  ): Promise<Result<void, SimulationReceiptRecorderError>>;
}

export interface SimulationWorldSnapshot {
  /** Digest of the exact world state supplied to the simulator. */
  readonly digest: SHA256;
  /** When sensors/world-state aggregation completed. */
  readonly observedAt: ISO8601;
  /** Hard validity boundary for decisions based on this snapshot. */
  readonly validUntil: ISO8601;
  /** Optional monotonic state version from the digital-twin service. */
  readonly stateEpoch?: string;
  /** Aggregate state-estimation uncertainty, normalized to [0, 1]. */
  readonly uncertainty?: number;
}

export interface SimulationRuntimeIdentity {
  /** Simulator or digital-twin backend (for example, gazebo or isaac-sim). */
  readonly backend: string;
  readonly version: string;
  /** Digest of the physical/world model used for the run. */
  readonly modelDigest: SHA256;
  /** Immutable container/VM image digest, when available. */
  readonly imageDigest?: SHA256;
}

export interface SimulationScenarioEvidence {
  /** Digest of the scenario distribution and perturbation policy. */
  readonly scenarioSetDigest: SHA256;
  readonly runCount: number;
  /** Normalized coverage score for required scenario classes. */
  readonly coverage?: number;
  /** Deterministic seeds, retained to reproduce sampled runs. */
  readonly seeds?: readonly number[];
}

export interface SimulationSafetyResult {
  readonly outcome: "pass" | "fail" | "indeterminate";
  readonly collisions: number;
  readonly safetyZoneViolations: number;
  readonly maxForceNewtons?: number;
  readonly maxVelocityMps?: number;
  readonly maxTorqueNm?: number;
  readonly maxJerkMps3?: number;
  readonly maxAngularVelocityRps?: number;
  readonly minClearanceMeters?: number;
  /** Explicit model assumptions presented to policy and human reviewers. */
  readonly assumptions?: readonly string[];
  /** Known effects the selected simulator cannot model. */
  readonly unsupportedPhenomena?: readonly string[];
}

/** Signed, replay-addressable proof that a specific requested effect was simulated. */
export interface SimulationEvidenceReceipt {
  readonly schemaVersion: "2.0.0";
  readonly receiptId: UUIDv7;
  readonly evidenceGrade: SimulationEvidenceGrade;
  /** Digest of the request with this receipt removed from executionContext. */
  readonly requestDigest: SHA256;
  /** Digest of resource, action, and params: the exact proposed effect plan. */
  readonly effectPlanDigest: SHA256;
  /** Digest of the complete signed capability token evaluated for this request. */
  readonly tokenDigest: SHA256;
  readonly resource: string;
  readonly action: string;
  readonly bindings?: SimulationSubjectBindings;
  readonly worldSnapshot: SimulationWorldSnapshot;
  readonly simulator: SimulationRuntimeIdentity;
  readonly scenarios: SimulationScenarioEvidence;
  readonly result: SimulationSafetyResult;
  readonly generatedAt: ISO8601;
  readonly expiresAt: ISO8601;
  /** Unique value consumed by the execution broker after authorization. */
  readonly nonce: string;
  /** Digest of the durable simulation trace/artifact bundle. */
  readonly artifactDigest: SHA256;
  readonly signerPublicKey: Ed25519PublicKey;
  /** Ed25519 signature over the canonical receipt with this field omitted. */
  readonly signature: Ed25519Signature;
}

/** Backend-neutral boundary implemented by deterministic and physics workers. */
export interface EffectSimulator {
  readonly backend: string;
  readonly supportedGrades: readonly SimulationEvidenceGrade[];

  simulate(
    preflight: SimulationPreflight,
    worldSnapshot?: SimulationWorldSnapshot,
  ): Promise<Result<SimulationEvidenceReceipt, EffectSimulationError>>;
}
