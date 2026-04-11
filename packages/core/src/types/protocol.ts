/**
 * SINT Protocol — Public interoperability nouns.
 *
 * These types define the stable public protocol vocabulary for discovery,
 * bridge interoperability, and governance artifacts.
 *
 * @module @sint/core/types/protocol
 */

import type { GeoPolygon, ISO8601, UUIDv7 } from "./primitives.js";
import type { ApprovalTier, SintSiteDeploymentProfile } from "./policy.js";
import type { SintPhysicalConstraints } from "./capability-token.js";

/**
 * CL-1.0 physical safety constraints within the structured envelope.
 */
export interface ConstraintEnvelopePhysical {
  readonly maxVelocityMps?: number;
  readonly maxForceNewtons?: number;
  readonly geofence?: GeoPolygon;
  readonly requiresHumanPresence?: boolean;
  readonly rateLimit?: {
    readonly maxCalls: number;
    readonly windowMs: number;
  };
}

/**
 * CL-1.0 model identity constraints.
 */
export interface ConstraintEnvelopeModel {
  readonly allowedModelIds?: readonly string[];
  readonly modelFingerprintHash?: string;
}

/**
 * CL-1.0 dynamic runtime tightening metadata.
 */
export interface ConstraintEnvelopeDynamic {
  readonly tightenOnly: boolean;
  readonly pluginRef?: string;
  readonly evidenceRequired?: boolean;
}

/**
 * CL-1.0 pre-approved execution corridor envelope.
 */
export interface ConstraintEnvelopeExecution {
  readonly corridorId?: string;
  readonly expiresAt?: ISO8601;
  readonly maxDeviationMeters?: number;
  readonly maxHeadingDeviationDeg?: number;
  readonly maxVelocityMps?: number;
  readonly maxForceNewtons?: number;
}

/**
 * CL-1.0 behavioral constraints for payload/pattern/rate controls.
 */
export interface ConstraintEnvelopeBehavioral {
  readonly maxPayloadBytes?: number;
  readonly allowedPatterns?: readonly string[];
  readonly deniedPatterns?: readonly string[];
  readonly maxRatePerMinute?: number;
}

/**
 * CL-1.0 attestation requirements within the constraint envelope.
 */
export interface ConstraintEnvelopeAttestation {
  readonly requiredGrade?: number;
  readonly requiredBackend?: string;
  readonly requireForTiers?: readonly ApprovalTier[];
}

/**
 * CL-1.0 constraint enforcement mode.
 */
export type ConstraintEnvelopeMode = "static-token" | "dynamic-runtime" | "corridor-preapproved";

/**
 * Constraint envelope used for corridor-style pre-approval and runtime tightening.
 *
 * Supports both legacy flat fields and CL-1.0 structured groups.
 * When both are present, CL-1.0 structured fields take precedence.
 */
export interface ConstraintEnvelope extends Partial<SintPhysicalConstraints> {
  // CL-1.0 structured fields
  readonly version?: "cl-1.0";
  readonly mode?: ConstraintEnvelopeMode;
  readonly physical?: ConstraintEnvelopePhysical;
  readonly behavioral?: ConstraintEnvelopeBehavioral;
  readonly model?: ConstraintEnvelopeModel;
  readonly attestation?: ConstraintEnvelopeAttestation;
  readonly dynamic?: ConstraintEnvelopeDynamic;
  readonly execution?: ConstraintEnvelopeExecution;
  readonly extensions?: Readonly<Record<string, unknown>>;
  // Legacy corridor fields (backward compat)
  readonly corridorId?: string;
  readonly expiresAt?: ISO8601;
  readonly maxDeviationMeters?: number;
  readonly maxHeadingDeviationDeg?: number;
}

/**
 * Public bridge profile describing protocol mapping and risk posture.
 */
export interface BridgeProfile {
  readonly bridgeId: string;
  readonly protocol: string;
  readonly version: string;
  readonly resourcePattern: string;
  readonly defaultTierByAction: Readonly<Record<string, ApprovalTier>>;
  readonly notes?: string;
}

/**
 * Site-level deployment profile for reusable industrial policy defaults.
 */
export interface SiteProfile {
  readonly siteId: string;
  readonly deploymentProfile: SintSiteDeploymentProfile;
  readonly bridges: readonly string[];
  readonly defaultEscalationTheta?: number;
  readonly notes?: string;
}

/**
 * K-of-N approval quorum definition exposed by public APIs.
 */
export interface ApprovalQuorum {
  readonly required: number;
  readonly authorized: readonly string[];
}

/**
 * Token revocation record exposed as an interoperable protocol noun.
 */
export interface Revocation {
  readonly tokenId: UUIDv7;
  readonly reason: string;
  readonly revokedBy: string;
  readonly timestamp: ISO8601;
}
