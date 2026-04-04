/**
 * SINT Protocol — Public interoperability nouns.
 *
 * These types define the stable public protocol vocabulary for discovery,
 * bridge interoperability, and governance artifacts.
 *
 * @module @sint/core/types/protocol
 */

import type { ISO8601, UUIDv7 } from "./primitives.js";
import type { ApprovalTier, SintSiteDeploymentProfile } from "./policy.js";
import type { SintPhysicalConstraints } from "./capability-token.js";

/**
 * Constraint envelope used for corridor-style pre-approval and runtime tightening.
 */
export interface ConstraintEnvelope extends Partial<SintPhysicalConstraints> {
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
