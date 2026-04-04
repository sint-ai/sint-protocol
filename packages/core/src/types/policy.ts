/**
 * SINT Protocol — Policy Gateway types.
 *
 * The Policy Gateway is the SINGLE choke point. No agent action —
 * tool call, ROS 2 topic publish, actuator command, capsule execution —
 * EVER bypasses the Policy Gateway.
 *
 * @module @sint/core/types/policy
 */

import type { SintPhysicalConstraints } from "./capability-token.js";
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

/** Well-known deployment profiles for industrial SINT rollouts. */
export type SintSiteDeploymentProfile =
  | "warehouse-amr"
  | "industrial-cell"
  | "edge-gateway"
  | string;

/** Runtime identity metadata for the executor handling the request. */
export interface SintExecutorIdentity {
  readonly runtimeId?: string;
  readonly nodeId?: string;
  readonly did?: string;
  readonly host?: string;
}

/** Model runtime metadata attached to a request. */
export interface SintModelRuntimeContext {
  readonly modelId?: string;
  readonly modelVersion?: string;
  readonly modelFingerprintHash?: string;
}

/** Attestation metadata attached to a request. */
export interface SintAttestationContext {
  readonly grade?: 0 | 1 | 2 | 3;
  readonly teeBackend?: "intel-sgx" | "arm-trustzone" | "amd-sev" | "tpm2" | "none";
  readonly quoteRef?: string;
}

/** Pre-approved execution corridor metadata attached to a request. */
export interface SintPreapprovedCorridor {
  readonly corridorId: string;
  readonly expiresAt: ISO8601;
  readonly maxDeviationMeters?: number;
  readonly maxHeadingDeviationDeg?: number;
}

/** Execution context metadata for cross-bridge/audit interoperability. */
export interface SintExecutionContext {
  readonly deploymentProfile?: SintSiteDeploymentProfile;
  readonly siteId?: string;
  readonly bridgeId?: string;
  readonly bridgeProtocol?: string;
  readonly executor?: SintExecutorIdentity;
  readonly model?: SintModelRuntimeContext;
  readonly attestation?: SintAttestationContext;
  readonly preapprovedCorridor?: SintPreapprovedCorridor;
}

/**
 * A request entering the Policy Gateway for evaluation.
 */
export interface SintRequest {
  readonly requestId: UUIDv7;
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
