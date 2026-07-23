/**
 * SINT Protocol — kinetic envelope types.
 *
 * Kinetic envelopes are opt-in runtime checks for physics-aware supervision.
 * They may tighten executable constraints and raise supervision, but they never
 * widen capability-token authority.
 *
 * @module @sint/core/types/kinetic-envelope
 */

import type { ApprovalTier, SintRequest } from "./policy.js";

/** Distinct deny code for physics vetoes where autonomy demand exceeds capacity. */
export const KINETIC_CAPACITY_EXCEEDED = "KINETIC_CAPACITY_EXCEEDED" as const;

/** Supervision level computed by a kinetic-envelope provider. */
export type SupervisionLevel =
  | "stable"
  | "metacognitive"
  | "assisted"
  | "regulated"
  | "silent_veto";

/** Joint-specific tightening emitted by a kinetic-envelope provider. */
export interface KineticJointLimit {
  readonly joint: string;
  readonly maxPositionRad?: number;
  readonly maxVelocityRps?: number;
  readonly maxEffortNm?: number;
}

/** Constraint overrides that must be min-merged with token constraints. */
export interface KineticTightenedConstraints {
  readonly maxVelocityMps?: number;
  readonly maxForceNewtons?: number;
  readonly maxTorqueNm?: number;
  readonly maxJerkMps3?: number;
  readonly maxAngularVelocityRps?: number;
  readonly jointLimits?: readonly KineticJointLimit[];
  readonly proximityMinMeters?: number;
}

/** Result returned by an opt-in kinetic-envelope provider. */
export interface KineticEnvelopeResult {
  /** Dimensionless autonomy demand, A >= 0. */
  readonly autonomyDemand: number;
  /** Dimensionless environmental capacity, E >= 0. */
  readonly environmentalCapacity: number;
  /** Normalized headroom, conventionally 1 - A/E when E > 0. */
  readonly margin: number;
  /** False when capacity is estimated or required sensing is missing. */
  readonly capacityKnown: boolean;
  /** Tighten-only executable constraints. */
  readonly tightenedConstraints: KineticTightenedConstraints;
  /** Supervision level required by the kinetic envelope. */
  readonly supervision: SupervisionLevel;
  /** Human-readable explanation fragments for audit/operator surfaces. */
  readonly rationale: readonly string[];
}

/** Opt-in plugin surface. No plugin registered means no gateway behavior change. */
export interface KineticEnvelopePlugin {
  computeEnvelope(request: SintRequest): Promise<KineticEnvelopeResult>;
}

/** Evidence receipt shape for the kinetic-envelope decision. */
export interface KineticReceipt {
  readonly requestId: string;
  readonly autonomyDemand: number;
  readonly environmentalCapacity: number;
  readonly margin: number;
  readonly capacityKnown: boolean;
  readonly supervision: SupervisionLevel;
  readonly finalTier: ApprovalTier;
  readonly deautomated: boolean;
  readonly vetoed: boolean;
  readonly policyCode?: typeof KINETIC_CAPACITY_EXCEEDED;
  readonly rationale: readonly string[];
}
