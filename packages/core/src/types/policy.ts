/**
 * SINT Protocol — Policy Gateway types.
 *
 * The Policy Gateway is the SINGLE choke point. No agent action —
 * tool call, ROS 2 topic publish, actuator command, capsule execution —
 * EVER bypasses the Policy Gateway.
 *
 * @module @sint/core/types/policy
 */

import type {
  SintPhysicalConstraints,
  SintVerifiableComputeProofType,
} from "./capability-token.js";
import type {
  DurationMs,
  Ed25519PublicKey,
  ISO8601,
  UUIDv7,
} from "./primitives.js";

/**
 * Approval tiers mapped to physical consequence severity.
 * This is the central innovation — graduated authorization
 * designed specifically for physical AI safety.
 */
export enum ApprovalTier {
  /** Read-only. Auto-approved, logged. No physical state change. */
  T0_OBSERVE = "T0_observe",
  /** Idempotent writes, staging. Auto-approved with audit. */
  T1_PREPARE = "T1_prepare",
  /** Stateful mutations with physical consequences. Requires review. */
  T2_ACT = "T2_act",
  /** Irreversible actions. Requires explicit human approval. */
  T3_COMMIT = "T3_commit",
}

/**
 * Risk tiers for classifying resource sensitivity.
 */
export enum RiskTier {
  /** Read-only data access. */
  T0_READ = "T0_read",
  /** Low-impact writes (e.g. saving a waypoint). */
  T1_WRITE_LOW = "T1_write_low",
  /** Stateful operations (e.g. moving an actuator). */
  T2_STATEFUL = "T2_stateful",
  /** Irreversible operations (e.g. financial transfer, cutting). */
  T3_IRREVERSIBLE = "T3_irreversible",
}

/** K-of-N approval quorum attached to escalated requests. */
export interface SintApprovalQuorum {
  /** Number of distinct approvals required before the request can proceed. */
  readonly required: number;
  /** Approver identifiers (e.g. DIDs or public keys) permitted to sign off. */
  readonly authorized: readonly string[];
}

/** Well-known deployment profiles for industrial SINT rollouts. */
export type SintSiteDeploymentProfile =
  | "warehouse-amr"
  | "industrial-cell"
  | "edge-gateway"
  | string;

/** Runtime identity metadata for the executor handling the request. */
export interface SintExecutorIdentity {
  /** Logical runtime identifier (e.g. "ros2-bridge", "mcp-server"). */
  readonly runtimeId?: string;
  /** Physical or logical node this runtime is executing on. */
  readonly nodeId?: string;
  /** Decentralized identifier (did:key / did:web) for the executor. */
  readonly did?: string;
  /** Network hostname or address of the executor. */
  readonly host?: string;
}

/** Model runtime metadata attached to a request. */
export interface SintModelRuntimeContext {
  /** Model identifier (e.g. "claude-opus-4-7", "gpt-4.1"). Checked against `modelConstraints.allowedModelIds`. */
  readonly modelId?: string;
  /** Model version string; compared against `modelConstraints.maxModelVersion` as semver. */
  readonly modelVersion?: string;
  /** Model weight fingerprint for tamper detection. */
  readonly modelFingerprintHash?: string;
}

/** Attestation metadata attached to a request. */
export interface SintAttestationContext {
  /** Attestation grade: 0 none, 1 self-attested, 2 TEE-backed, 3 remote-attested TEE. */
  readonly grade?: 0 | 1 | 2 | 3;
  /** Trusted execution environment backend reporting the attestation. */
  readonly teeBackend?: "intel-sgx" | "arm-trustzone" | "amd-sev" | "tpm2" | "none";
  /** Opaque reference to the TEE quote (URL, hash, or handle). */
  readonly quoteRef?: string;
}

/** Verifiable compute proof metadata attached to a request. */
export interface SintVerifiableComputeContext {
  /** Proof system in use (e.g. "risc0-groth16", "snark"). */
  readonly proofType?: SintVerifiableComputeProofType;
  /** Reference to the serialized proof object (URL or storage handle). */
  readonly proofRef?: string;
  /** SHA-256 hash of the proof bytes for integrity. */
  readonly proofHash?: string;
  /** SHA-256 hash of the public-inputs tuple committed to by the proof. */
  readonly publicInputsHash?: string;
  /** When the proof was generated (ISO 8601); used with `maxProofAgeMs`. */
  readonly generatedAt?: ISO8601;
  /** Reference to the verifier used to check this proof. */
  readonly verifierRef?: string;
}

/** Hardware safety-controller handshake metadata attached to a request. */
export interface SintHardwareSafetyContext {
  /**
   * Permit state from the safety controller.
   * T2/T3 industrial actions are expected to run only when this is "granted".
   */
  readonly permitState?: "granted" | "denied" | "unknown" | "stale";
  /** Safety interlock state for the executing zone/cell. */
  readonly interlockState?: "closed" | "open" | "fault" | "unknown";
  /** Emergency-stop state observed by the bridge/controller. */
  readonly estopState?: "clear" | "triggered" | "unknown";
  /** Time the safety controller state was observed. */
  readonly observedAt?: ISO8601;
  /** Optional controller identifier (PLC / relay / safety I/O gateway). */
  readonly controllerId?: string;
}

/** Pre-approved execution corridor metadata attached to a request. */
export interface SintPreapprovedCorridor {
  /** Identifier of the corridor envelope previously approved for this agent. */
  readonly corridorId: string;
  /** Corridor expiry; requests arriving after this must re-seek approval. */
  readonly expiresAt: ISO8601;
  /** Maximum allowed deviation from the corridor centerline, in metres. */
  readonly maxDeviationMeters?: number;
  /** Maximum allowed heading deviation from the corridor direction, in degrees. */
  readonly maxHeadingDeviationDeg?: number;
}

/**
 * Execution context metadata for cross-bridge/audit interoperability.
 * Every field is optional — bridges populate whatever they know so the
 * gateway can reason about model identity, attestation, safety interlocks,
 * and pre-approved corridors when making tier assignments.
 */
export interface SintExecutionContext {
  /** Named deployment profile driving policy defaults. */
  readonly deploymentProfile?: SintSiteDeploymentProfile;
  /** Operator-assigned site identifier (facility, warehouse, cell). */
  readonly siteId?: string;
  /** Identifier of the bridge that normalized the request. */
  readonly bridgeId?: string;
  /** Wire protocol the bridge translates (e.g. "ros2", "mcp", "mqtt"). */
  readonly bridgeProtocol?: string;
  /** Runtime identity of the process dispatching the action. */
  readonly executor?: SintExecutorIdentity;
  /** Model runtime context for model-bound token constraints. */
  readonly model?: SintModelRuntimeContext;
  /** TEE attestation context for attestation-bound token constraints. */
  readonly attestation?: SintAttestationContext;
  /** Verifiable compute proof context for proof-bound token constraints. */
  readonly verifiableCompute?: SintVerifiableComputeContext;
  /** Hardware safety interlock / permit state observed at request time. */
  readonly hardwareSafety?: SintHardwareSafetyContext;
  /** Pre-approved execution corridor, if this request is executing under one. */
  readonly preapprovedCorridor?: SintPreapprovedCorridor;
}

/**
 * A request entering the Policy Gateway for evaluation.
 */
export interface SintRequest {
  /** Unique, client-supplied request identifier. */
  readonly requestId: UUIDv7;
  /** When the request was emitted by the bridge (ISO 8601, microsecond precision). */
  readonly timestamp: ISO8601;

  /** The agent making the request. */
  readonly agentId: Ed25519PublicKey;

  /** Capability token authorizing this request. */
  readonly tokenId: UUIDv7;

  /** Target resource URI (e.g. "ros2:///cmd_vel"). */
  readonly resource: string;

  /** Requested action (e.g. "publish", "call"). */
  readonly action: string;

  /** Action parameters / payload. */
  readonly params: Record<string, unknown>;

  /** Physical context from sensor fusion. */
  readonly physicalContext?: {
    readonly humanDetected?: boolean;
    readonly currentForceNewtons?: number;
    readonly currentVelocityMps?: number;
    readonly currentPosition?: { x: number; y: number; z: number };
  };

  /** Sequence of recent actions by this agent (for combo detection). */
  readonly recentActions?: readonly string[];

  /** Optional execution/deployment metadata for policy and audit correlation. */
  readonly executionContext?: SintExecutionContext;
}

/**
 * The Policy Gateway's decision on a request.
 *
 * The gateway doesn't just allow/deny — it can transform requests,
 * add constraints, and require additional approval.
 */
export interface PolicyDecision {
  readonly requestId: UUIDv7;
  readonly timestamp: ISO8601;
  readonly action: "allow" | "deny" | "escalate" | "transform";

  /** Transformations applied even on "allow" (e.g. reduced velocity). */
  readonly transformations?: {
    readonly constraintOverrides?: Partial<SintPhysicalConstraints>;
    readonly additionalAuditFields?: Record<string, unknown>;
  };

  /** Present when action is "escalate". */
  readonly escalation?: {
    readonly requiredTier: ApprovalTier;
    readonly reason: string;
    readonly timeoutMs: DurationMs;
    readonly fallbackAction: "deny" | "safe-stop";
    readonly approvalQuorum?: SintApprovalQuorum;
  };

  /** Present when action is "deny". */
  readonly denial?: {
    readonly reason: string;
    readonly policyViolated: string;
    readonly suggestedAlternative?: string;
  };

  /** The assigned approval tier for this request. */
  readonly assignedTier: ApprovalTier;

  /** The assigned risk tier for the target resource. */
  readonly assignedRisk: RiskTier;
}

/**
 * Configuration for the tier assignment engine.
 */
export interface TierAssignmentRule {
  /** Glob pattern matching resource URIs (e.g. "ros2:///cmd_*"). */
  readonly resourcePattern: string;
  /** Actions this rule applies to. */
  readonly actions: readonly string[];
  /** Base tier for this resource/action combination. */
  readonly baseTier: ApprovalTier;
  /** Base risk for this resource. */
  readonly baseRisk: RiskTier;
  /** Whether human presence detection escalates the tier. */
  readonly escalateOnHumanPresence?: boolean;
  /** Whether this is a new/untrusted agent (escalate one tier). */
  readonly escalateOnNewAgent?: boolean;
}

/**
 * A forbidden tool combination — sequences of actions that
 * must be blocked or require elevated approval.
 *
 * @example
 * ```ts
 * const combo: ForbiddenCombination = {
 *   sequence: ["filesystem.write", "exec.run"],
 *   requiredTier: ApprovalTier.T3_COMMIT,
 *   reason: "Capability laundering: write then execute is a code injection vector",
 * };
 * ```
 */
export interface ForbiddenCombination {
  readonly sequence: readonly string[];
  readonly windowMs: DurationMs;
  readonly requiredTier: ApprovalTier;
  readonly reason: string;
}

/**
 * Status of an approval request in the queue.
 */
export type ApprovalRequestStatus =
  | "pending"
  | "approved"
  | "denied"
  | "timeout"
  | "expired";

/**
 * A batch intercept request — array of SintRequests.
 */
export interface BatchInterceptRequest {
  readonly requests: readonly SintRequest[];
}

/**
 * Rate-limit store — sliding-window counter per token.
 *
 * Implemented by CacheStore adapters.  The key is typically
 * `sint:rate:<tokenId>:<windowBucket>`.
 */
export interface RateLimitStore {
  /** Increment the call count for a key and return the new count. */
  increment(key: string, windowMs: number): Promise<number>;
  /** Get the current call count for a key (0 if not set). */
  getCount(key: string): Promise<number>;
}

/**
 * A batch intercept response — per-request results.
 */
export interface BatchInterceptResponse {
  readonly results: readonly {
    readonly status: number;
    readonly decision?: PolicyDecision;
    readonly error?: string;
  }[];
}
