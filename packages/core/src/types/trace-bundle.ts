/**
 * SINT Protocol — Shared trace bundle types.
 *
 * Trace bundles are portable, signed evidence packets used across factory,
 * roadway, humanoid, and authority workflows. The base shape stays generic so
 * domain bundles can extend it without reimplementing signing or verification.
 */

import type {
  Ed25519PublicKey,
  Ed25519Signature,
  ISO8601,
  SHA256,
  UUIDv7,
} from "./primitives.js";

export interface EvidenceArtifactRef {
  readonly evidenceType: string;
  readonly evidenceRef: string;
  readonly proofHash: SHA256;
  readonly verifierRef?: string;
  readonly observedAt?: ISO8601;
  readonly maxAgeMs?: number;
}

export type RedactionMode = "unredacted" | "partial" | "redacted";

export interface RedactionProfile {
  readonly mode: RedactionMode;
  readonly policyRef?: string;
  readonly redactedFields?: readonly string[];
  readonly justification?: string;
}

export type CorrectionEventType =
  | "amendment"
  | "retraction"
  | "replacement"
  | "redaction"
  | "supplement";

export interface CorrectionEventRef {
  readonly eventId: UUIDv7;
  readonly correctionType: CorrectionEventType;
  readonly correctedAt: ISO8601;
  readonly correctedBy?: string;
  readonly reason?: string;
  readonly previousBundleHash?: SHA256;
}

export interface TraceBundleBase {
  readonly bundleId: UUIDv7;
  readonly traceKind: string;
  readonly generatedAt: ISO8601;
  readonly evidenceArtifacts: readonly EvidenceArtifactRef[];
  readonly redactionProfile?: RedactionProfile;
  readonly correctionEvents?: readonly CorrectionEventRef[];
  readonly previousBundleHash?: SHA256;
  readonly bundleHash: SHA256;
  readonly signerPublicKey: Ed25519PublicKey;
  readonly signature: Ed25519Signature;
}

