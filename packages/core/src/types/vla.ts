/** Governance contracts for vision-language-action and other streaming policies. */

import type { ISO8601, UUIDv7 } from "./primitives.js";

export interface VlaStateVector {
  readonly positions?: readonly number[];
  readonly velocities?: readonly number[];
}

/** A bounded, short-lived action proposal emitted by a continuous control policy. */
export interface VlaActionChunkEnvelope {
  readonly chunkId: UUIDv7;
  readonly streamId: string;
  readonly sequence: number;
  readonly issuedAt: ISO8601;
  readonly executeBy: ISO8601;
  readonly horizonMs: number;
  readonly controlHz: number;
  readonly actionCount: number;
  readonly actionSpaceDigest: string;
  readonly embodimentId: string;
  readonly worldSnapshotDigest: string;
  readonly firstState?: VlaStateVector;
  readonly lastState?: VlaStateVector;
  readonly maxVelocityMps?: number;
  readonly maxAccelerationMps2?: number;
  readonly maxJerkMps3?: number;
  readonly safeStopOnFailure: true;
}

/** Signed or content-addressed operator intent within which model steering may occur. */
export interface VlaTaskIntentEnvelope {
  readonly intentDigest: string;
  readonly instructionDigest: string;
  readonly allowedObjects?: readonly string[];
  readonly allowedZones?: readonly string[];
  readonly allowedOperations?: readonly string[];
  readonly visualSubgoalDigests?: readonly string[];
  readonly controlModality?: string;
  readonly expiresAt: ISO8601;
}

/** Append-only provenance pointer for embodied memory used in a decision. */
export interface VlaMemoryEvidenceRef {
  readonly evidenceDigest: string;
  readonly modality: "video" | "image" | "sensor" | "text-summary";
  readonly sourceId: string;
  readonly writerId: string;
  readonly observedFrom: ISO8601;
  readonly observedUntil: ISO8601;
  readonly worldStateEpoch: string;
  readonly parentEvidenceDigests?: readonly string[];
  readonly confidence?: number;
  readonly expiresAt: ISO8601;
}

/** Token-bound permission to produce a narrowly scoped adapted checkpoint. */
export interface VlaAdaptationPermit {
  readonly permitId: UUIDv7;
  readonly baseCheckpointDigest: string;
  readonly trainableComponents: readonly string[];
  readonly rewardSpecDigest: string;
  readonly datasetDigest?: string;
  readonly rollbackCheckpointDigest: string;
  readonly maxTrials: number;
  readonly maxDurationMs: number;
  readonly maxVelocityMps?: number;
  readonly maxForceNewtons?: number;
  readonly requiresSimulationPass: true;
  readonly expiresAt: ISO8601;
}
