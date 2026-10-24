import type { Ed25519Signature, ISO8601, SHA256, UUIDv7 } from "./primitives.js";

/** Token-bound limits for an actuator that delivers hazardous energy. */
export interface HazardousEnergyEnvelope {
  readonly domain: "laser" | "welding" | "thermal" | "radiation";
  readonly actuatorIds: readonly string[];
  readonly maxPowerWatts?: number;
  readonly maxPulseEnergyJoules?: number;
  readonly maxDwellMs?: number;
  readonly maxDutyCyclePercent?: number;
  readonly maxFiringsPerMinute?: number;
  readonly allowedTargetClasses: readonly string[];
  readonly protectedTargetClasses: readonly string[];
  readonly minTargetConfidence: number;
  readonly maxObservationAgeMs: number;
  readonly maxSpatialUncertaintyMm: number;
  readonly minProtectedObjectClearanceMm: number;
  readonly requiredInterlocks?: readonly string[];
  readonly requireHealthyCooling?: boolean;
  readonly requireHardwarePermit: true;
}

/** Signed, digest-only perception proof supplied with a physical action. */
export interface PerceptionEvidence {
  readonly evidenceId: UUIDv7;
  readonly observedAt: ISO8601;
  readonly validUntil: ISO8601;
  readonly sensorId: string;
  readonly frameDigest: SHA256;
  readonly modelId: string;
  readonly checkpointDigest: SHA256;
  readonly calibrationDigest: SHA256;
  readonly target: {
    readonly classId: string;
    readonly confidence: number;
    readonly centroid: { readonly x: number; readonly y: number };
    readonly spatialUncertaintyMm: number;
  };
  readonly nearbyProtectedObjects: readonly {
    readonly classId: string;
    readonly confidence: number;
    readonly distanceMm: number;
  }[];
  readonly verifierRef: string;
  readonly signerPublicKey: string;
  readonly signature: Ed25519Signature;
}
