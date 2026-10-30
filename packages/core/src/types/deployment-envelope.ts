/**
 * SINT Protocol - Shared deployment envelope types.
 *
 * These types are intentionally generic so factory, roadway, and humanoid
 * deployments can share freshness, binding, and evidence semantics without
 * inventing separate one-off shapes.
 */

import type { DurationMs, ISO8601, SHA256 } from "./primitives.js";

export interface ProofFreshnessRequirement {
  readonly maxProofAgeMs?: DurationMs;
  readonly requireObservedAt?: boolean;
}

export interface ContextualBinding {
  readonly deploymentProfile?: string;
  readonly siteId?: string;
  readonly bridgeId?: string;
  readonly bridgeProtocol?: string;
  readonly robotId?: string;
  readonly fleetId?: string;
  readonly controllerId?: string;
  readonly zoneId?: string;
  readonly resource?: string;
  readonly action?: string;
}

export interface RequiredEvidenceRef {
  readonly evidenceType: string;
  readonly evidenceRef: string;
  readonly proofHash?: SHA256;
  readonly verifierRef?: string;
  readonly observedAt?: ISO8601;
  readonly maxAgeMs?: DurationMs;
}

export interface DeploymentEvidenceRef extends RequiredEvidenceRef {
  readonly observedAt: ISO8601;
}

export interface DeploymentEnvelopeBase {
  readonly envelopeId?: string;
  readonly contextualBinding?: ContextualBinding;
  readonly proofFreshness?: ProofFreshnessRequirement;
  readonly requiredEvidenceRefs?: readonly RequiredEvidenceRef[];
  readonly allowedVerifiers?: readonly string[];
}

