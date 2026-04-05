/**
 * SINT Protocol — Capability Token types.
 *
 * Capability tokens are the atomic unit of permission in SINT.
 * They are unforgeable, delegatable, revocable tokens that grant
 * specific permissions on specific resources for specific durations.
 *
 * There is NO ambient authority — no admin roles, no superuser.
 * An agent can only do what its tokens explicitly permit.
 *
 * @module @sint/core/types/capability-token
 */

import type {
  DurationMs,
  Ed25519PublicKey,
  Ed25519Signature,
  GeoPolygon,
  ISO8601,
  MetersPerSecond,
  Newtons,
  UUIDv7,
} from "./primitives.js";
import type { ApprovalTier } from "./policy.js";

/**
 * Physical safety constraints enforced by the Policy Gateway
 * before every physical action. These are NOT metadata — they
 * are checked at runtime and violations trigger e-stop.
 *
 * @example
 * ```ts
 * const constraints: SintPhysicalConstraints = {
 *   maxForceNewtons: 50,        // Collaborative robot limit
 *   maxVelocityMps: 0.5,       // Human-shared workspace
 *   geofence: { coordinates: [[-122.4, 37.7], ...] },
 *   requiresHumanPresence: true,
 * };
 * ```
 */
export interface SintPhysicalConstraints {
  /** Maximum force the agent may command, in Newtons. */
  readonly maxForceNewtons?: Newtons;

  /** Maximum velocity the agent may command, in m/s. */
  readonly maxVelocityMps?: MetersPerSecond;

  /** Physical boundary the agent must stay within. */
  readonly geofence?: GeoPolygon;

  /** Time window during which this token is valid. */
  readonly timeWindow?: {
    readonly start: ISO8601;
    readonly end: ISO8601;
  };

  /** Maximum number of times the permitted action can be performed. */
  readonly maxRepetitions?: number;

  /** If true, agent must detect human presence before acting. */
  readonly requiresHumanPresence?: boolean;

  /**
   * Rate limit: maximum number of calls allowed within a rolling time window.
   * Enforced by the Policy Gateway using a sliding-window counter.
   *
   * @example
   * ```ts
   * // No more than 10 tool calls per minute
   * rateLimit: { maxCalls: 10, windowMs: 60_000 }
   * ```
   */
  readonly rateLimit?: {
    readonly maxCalls: number;
    readonly windowMs: DurationMs;
  };

  /**
   * Multi-party approval quorum: how many authorised operators must approve
   * before a T2/T3 escalation is resolved.  K-of-N model.
   *
   * @example
   * ```ts
   * // Require any 2 of 3 named operators to approve
   * quorum: { required: 2, authorized: ["op-alice", "op-bob", "op-carol"] }
   * ```
   */
  readonly quorum?: {
    readonly required: number;
    readonly authorized: readonly string[];
  };

  /** Maximum torque the agent may command, in Newton-metres. */
  readonly maxTorqueNm?: number;

  /** Maximum jerk the agent may command, in m/s³ (rate of acceleration change). */
  readonly maxJerkMps3?: number;

  /** Maximum angular velocity the agent may command, in rad/s. */
  readonly maxAngularVelocityRps?: number;

  /** Force threshold above which contact is detected, in Newtons. */
  readonly contactForceThresholdN?: number;
}

/**
 * Behavioral constraints enforced at runtime against tool call inputs.
 *
 * These are checked by the Policy Gateway on every tool invocation — not just
 * at credential issuance — to ensure the agent's runtime behavior stays within
 * the bounds declared at token issuance time.
 *
 * Addresses the gap identified by the agentidentityprotocol community: a token
 * may be legitimately issued but the agent's runtime behavior can still diverge.
 *
 * @example
 * ```ts
 * const bc: SintBehavioralConstraints = {
 *   maxCallsPerMinute: 30,
 *   allowedPatterns: ["^/safe/.*", "^read:"],
 *   deniedPatterns: ["rm\\s+-rf", "DROP\\s+TABLE"],
 *   maxPayloadBytes: 65536,
 * };
 * ```
 */
export interface SintBehavioralConstraints {
  /**
   * Maximum number of tool calls permitted within any 60-second rolling window.
   * Enforcement is sliding-window, checked per token by the Policy Gateway.
   */
  readonly maxCallsPerMinute?: number;

  /**
   * Allowlist of ECMAScript regex patterns that tool-call inputs MUST match.
   * At least one pattern must match the serialised input for the call to proceed.
   * If empty or absent, any input is allowed (subject to deniedPatterns).
   */
  readonly allowedPatterns?: readonly string[];

  /**
   * Denylist of ECMAScript regex patterns that unconditionally block execution.
   * If any pattern matches the serialised tool-call input, the call is denied.
   * Checked before allowedPatterns.
   */
  readonly deniedPatterns?: readonly string[];

  /**
   * Maximum size (in bytes) of the serialised tool-call payload (JSON.stringify).
   * Requests exceeding this limit are denied with CONSTRAINT_VIOLATION.
   */
  readonly maxPayloadBytes?: number;
}

/**
 * Constraints that bind a capability token to specific model identities.
 * Used to prevent silent model swaps in high-risk physical deployments.
 */
export interface SintModelConstraints {
  /** Allowlist of model IDs (e.g. "gpt-5.4", "gemini-robotics"). */
  readonly allowedModelIds?: readonly string[];
  /** Optional semver ceiling for model version (inclusive). */
  readonly maxModelVersion?: string;
  /** Optional SHA-256 fingerprint of model/runtime bundle. */
  readonly modelFingerprintHash?: string;
}

/** Attestation backends supported by SINT enforcement and evidence flows. */
export type SintAttestationBackend =
  | "intel-sgx"
  | "arm-trustzone"
  | "amd-sev"
  | "tpm2"
  | "none";

/** Verifiable compute proof families supported by SINT metadata contracts. */
export type SintVerifiableComputeProofType =
  | "risc0-groth16"
  | "sp1-groth16"
  | "snark"
  | "stark"
  | "tee-attested";

/**
 * Requirements for runtime attestation attached to token usage.
 * Enforcement is optional and controlled by gateway policy.
 */
export interface SintAttestationRequirements {
  /** Minimum attestation grade (0..3). */
  readonly minAttestationGrade?: 0 | 1 | 2 | 3;
  /** Allowlist of accepted TEE/attestation backends. */
  readonly allowedTeeBackends?: readonly SintAttestationBackend[];
  /** Tiers for which attestation is required. */
  readonly requireForTiers?: readonly ApprovalTier[];
}

/**
 * Requirements for verifiable-compute proofs attached to token usage.
 * Enables provable execution metadata checks for high-consequence actions.
 */
export interface SintVerifiableComputeRequirements {
  /** Tiers that require proof material to be attached at request time. */
  readonly requireForTiers?: readonly ApprovalTier[];
  /** Optional allowlist of proof families accepted for this token. */
  readonly allowedProofTypes?: readonly SintVerifiableComputeProofType[];
  /** Optional allowlist of verifier IDs/URIs trusted for this token. */
  readonly verifierRefs?: readonly string[];
  /** Optional max age (ms) for proof freshness checks. */
  readonly maxProofAgeMs?: DurationMs;
  /** Require `publicInputsHash` to be present in runtime proof metadata. */
  readonly requirePublicInputsHash?: boolean;
}

/**
 * Optional pre-approved execution corridor for low-latency physical control loops.
 * Requests inside the corridor can proceed without per-step reapproval.
 */
export interface SintExecutionEnvelope {
  /** Logical corridor identifier for traceability. */
  readonly corridorId?: string;
  /** Corridor expiry in ISO8601 UTC format. */
  readonly expiresAt?: ISO8601;
  /** Maximum allowed lateral deviation from corridor centerline (meters). */
  readonly maxDeviationMeters?: number;
  /** Maximum allowed heading deviation from corridor heading (degrees). */
  readonly maxHeadingDeviationDeg?: number;
  /** Optional corridor-specific velocity cap (m/s). */
  readonly maxVelocityMps?: MetersPerSecond;
  /** Optional corridor-specific force cap (N). */
  readonly maxForceNewtons?: Newtons;
}

/**
 * Delegation chain tracking — who authorized this token, all the way up.
 * Maximum delegation depth is enforced by policy (default: 3 hops).
 */
export interface SintDelegationChain {
  /** Token ID of the parent capability that authorized this one. */
  readonly parentTokenId: UUIDv7 | null;

  /** Number of delegation hops from the root capability. */
  readonly depth: number;

  /** Whether this capability was reduced (attenuated) from the parent. */
  readonly attenuated: boolean;
}

/**
 * The SINT Capability Token — the atomic unit of permission.
 *
 * Every field is immutable after issuance. The token is cryptographically
 * bound to a specific issuer and subject via Ed25519 signatures.
 *
 * @example
 * ```ts
 * const token: SintCapabilityToken = {
 *   tokenId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
 *   issuer: "a1b2c3...",  // Ed25519 pubkey of issuing authority
 *   subject: "d4e5f6...", // Ed25519 pubkey of receiving agent
 *   resource: "ros2:///cmd_vel",
 *   actions: ["publish"],
 *   constraints: { maxVelocityMps: 0.5 },
 *   delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
 *   issuedAt: "2026-03-16T10:00:00.000000Z",
 *   expiresAt: "2026-03-16T22:00:00.000000Z",
 *   revocable: true,
 *   signature: "...",
 * };
 * ```
 */
export interface SintCapabilityToken {
  // --- Identity ---
  readonly tokenId: UUIDv7;
  readonly issuer: Ed25519PublicKey;
  readonly subject: Ed25519PublicKey;

  // --- Scope ---
  /** Resource URI (e.g. "ros2:///cmd_vel", "mcp://server/tool"). */
  readonly resource: string;
  /** Permitted actions on the resource (e.g. ["publish"], ["call", "cancel"]). */
  readonly actions: readonly string[];
  /** Physical safety constraints — enforced, not advisory. */
  readonly constraints: SintPhysicalConstraints;
  /** Optional model identity restrictions for runtime use of this token. */
  readonly modelConstraints?: SintModelConstraints;
  /** Optional attestation requirements for this token. */
  readonly attestationRequirements?: SintAttestationRequirements;
  /** Optional verifiable-compute proof requirements for this token. */
  readonly verifiableComputeRequirements?: SintVerifiableComputeRequirements;
  /** Optional pre-approved execution envelope for low-latency control. */
  readonly executionEnvelope?: SintExecutionEnvelope;
  /**
   * Optional runtime behavioral constraints enforced against tool-call inputs.
   * Supplements physical constraints with pattern-based input validation and
   * per-minute rate limiting at the tool-call level.
   */
  readonly behavioralConstraints?: SintBehavioralConstraints;

  // --- Cross-protocol identity (Agent Passport System interop) ---
  /**
   * Agent Passport System (APS) passport identifier.
   * Links this SINT token to an external APS Ed25519 passport for
   * cross-protocol identity verification.
   * @see https://github.com/aeoess/agent-passport-system
   */
  readonly passportId?: string;
  /**
   * Depth of this token in the delegation chain from the APS perspective.
   * 0 = root (issued directly against an APS passport). Increases with
   * each delegation hop. Used by cascade revocation to order traversal.
   */
  readonly delegationDepth?: number;

  // --- Delegation ---
  readonly delegationChain: SintDelegationChain;

  // --- Lifecycle ---
  readonly issuedAt: ISO8601;
  readonly expiresAt: ISO8601;
  readonly revocable: boolean;
  readonly revocationEndpoint?: string;

  // --- Cryptographic binding ---
  readonly signature: Ed25519Signature;
}

/** Fields required to issue a new capability token (before signing). */
export interface SintCapabilityTokenRequest {
  readonly issuer: Ed25519PublicKey;
  readonly subject: Ed25519PublicKey;
  readonly resource: string;
  readonly actions: readonly string[];
  readonly constraints: SintPhysicalConstraints;
  readonly modelConstraints?: SintModelConstraints;
  readonly attestationRequirements?: SintAttestationRequirements;
  readonly verifiableComputeRequirements?: SintVerifiableComputeRequirements;
  readonly executionEnvelope?: SintExecutionEnvelope;
  /** Optional runtime behavioral constraints for this token. */
  readonly behavioralConstraints?: SintBehavioralConstraints;
  /** APS passport identifier for cross-protocol identity linkage. */
  readonly passportId?: string;
  /** Delegation depth in the APS chain (0 = root). */
  readonly delegationDepth?: number;
  readonly delegationChain: SintDelegationChain;
  readonly expiresAt: ISO8601;
  readonly revocable: boolean;
  readonly revocationEndpoint?: string;
}

/** Validation error codes for capability tokens. */
export type CapabilityTokenError =
  | "INVALID_SIGNATURE"
  | "TOKEN_EXPIRED"
  | "TOKEN_REVOKED"
  | "DELEGATION_DEPTH_EXCEEDED"
  | "CONSTRAINT_VIOLATION"
  | "INSUFFICIENT_PERMISSIONS"
  | "MALFORMED_TOKEN"
  | "UNKNOWN_ISSUER";
