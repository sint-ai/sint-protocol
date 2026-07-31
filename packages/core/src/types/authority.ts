/**
 * SINT Protocol - Human authority types.
 *
 * These types carry privacy-preserving human provenance and delegation scope
 * for high-consequence actions, approval flows, agent payments, and
 * human-on-the-loop physical control.
 */

import type { DurationMs, ISO8601, SHA256 } from "./primitives.js";

export type HumanPrincipalRef = string;

export type HumanAssuranceLevel =
  | "humanhood"
  | "uniqueness"
  | "delegation"
  | "contextual_binding";

export interface HumanAuthorityBinding {
  readonly applicationId?: string;
  readonly siteId?: string;
  readonly robotId?: string;
  readonly resource?: string;
  readonly action?: string;
  readonly valueCurrency?: string;
  readonly minValue?: number;
  readonly maxValue?: number;
  readonly validFrom?: ISO8601;
  readonly validUntil?: ISO8601;
}

export interface HumanDelegationChain {
  readonly depth: number;
  readonly rootPrincipalRef?: HumanPrincipalRef;
  readonly parentProofRef?: string;
  readonly hopProofRefs?: readonly string[];
}

export interface HumanAuthorityProof {
  readonly principalRef: HumanPrincipalRef;
  readonly assuranceLevel: HumanAssuranceLevel;
  readonly proofRef?: string;
  readonly proofHash?: SHA256;
  readonly verifierRef?: string;
  readonly observedAt?: ISO8601;
  readonly revokedAt?: ISO8601;
  readonly binding?: HumanAuthorityBinding;
  readonly delegationChain?: HumanDelegationChain;
}

export interface HumanAuthorityRequirements {
  readonly requiredAssuranceLevel: HumanAssuranceLevel;
  readonly allowedProofProviders?: readonly string[];
  readonly maxProofAgeMs?: DurationMs;
  readonly requiredBinding?: HumanAuthorityBinding;
  readonly allowedDelegationDepth?: number;
  readonly requireUniquePrincipal?: boolean;
}

export type HumanAuthorityEnvelope = HumanAuthorityRequirements;
