import type {
  EffectPlan,
  EffectSimulationError,
  Point3D,
  Result,
  SHA256,
  SimulationSafetyResult,
  SimulationArtifactStore,
  SimulationReceiptRecorder,
  SimulationSubjectBindings,
  SimulationWorldSnapshot,
} from "@pshkv/core";

export interface NumericRange {
  readonly min: number;
  readonly max: number;
}

export interface AxisAlignedWorkspace {
  readonly x: NumericRange;
  readonly y: NumericRange;
  readonly z: NumericRange;
}

export interface DeterministicSafetyEnvelope {
  readonly jointLimits?: Readonly<Record<string, NumericRange>>;
  readonly workspace?: AxisAlignedWorkspace;
  readonly maxVelocityMps?: number;
  readonly maxForceNewtons?: number;
  readonly minClearanceMeters?: number;
  readonly maxCollisions?: number;
  readonly maxSafetyZoneViolations?: number;
}

export interface DeterministicCheckResult {
  readonly result: SimulationSafetyResult;
  readonly checks: readonly DeterministicCheckRecord[];
}

export interface DeterministicCheckRecord {
  readonly check: string;
  readonly status: "pass" | "fail" | "unknown";
  readonly observed?: number | Point3D | Readonly<Record<string, number>>;
  readonly expected?: string;
}

/** Pluggable, explicitly scoped model for one family of deterministic effects. */
export interface DeterministicEffectModel {
  readonly id: string;
  supports(effectPlan: EffectPlan): boolean;
  evaluate(
    effectPlan: EffectPlan,
    worldSnapshot: SimulationWorldSnapshot,
  ): Result<DeterministicCheckResult, EffectSimulationError>;
}

export interface DeterministicEffectSimulatorOptions {
  readonly signerPublicKey: string;
  readonly signerPrivateKey: string;
  readonly version: string;
  readonly modelDigest: SHA256;
  readonly imageDigest?: SHA256;
  readonly models: readonly DeterministicEffectModel[];
  /** Every issued receipt must reference an artifact durably accepted here. */
  readonly artifactStore: SimulationArtifactStore;
  /** Every returned receipt must first be appended to the Evidence Ledger. */
  readonly receiptRecorder: SimulationReceiptRecorder;
  readonly receiptTtlMs?: number;
  readonly bindings?: SimulationSubjectBindings;
  readonly now?: () => number;
}

export interface BoundedMotionEffectModelOptions {
  readonly id?: string;
  readonly resources: readonly (string | RegExp)[];
  readonly actions: readonly string[];
  readonly envelope: DeterministicSafetyEnvelope;
}
