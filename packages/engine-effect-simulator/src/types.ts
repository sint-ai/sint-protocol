import type {
  EffectPlan,
  EffectSimulationError,
  Point3D,
  Result,
  SHA256,
  SimulationSafetyResult,
  SimulationScenarioEvidence,
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
  /** Present only when a model actually ran an approved fixed case policy. */
  readonly scenarios?: SimulationScenarioEvidence;
  /** The case policy retained in the signed trace for exact replay. */
  readonly scenarioPolicy?: NavigationScenarioPolicy | BoundedMotionScenarioPolicy;
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
  ): Promise<Result<DeterministicCheckResult, EffectSimulationError>> | Result<DeterministicCheckResult, EffectSimulationError>;
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
  /** Future clock-skew tolerance (ms) for a snapshot's observedAt; defaults to 250ms to match the ROS2 adapter. */
  readonly maxClockSkewMs?: number;
  readonly bindings?: SimulationSubjectBindings;
  readonly now?: () => number;
}

export interface BoundedMotionEffectModelOptions {
  readonly id?: string;
  readonly resources: readonly (string | RegExp)[];
  readonly actions: readonly string[];
  readonly envelope: DeterministicSafetyEnvelope;
}

/** Conservative 2D checker for a short ROS 2 waypoint path. */
export interface SceneAwareNavigationModelOptions {
  readonly id?: string;
  readonly resources: readonly (string | RegExp)[];
  readonly actions: readonly string[];
  readonly artifactStore: SimulationArtifactStore;
  readonly robotRadiusMeters: number;
  readonly minClearanceMeters: number;
  readonly maxVelocityMps: number;
  readonly maxHorizonMs: number;
  /** Worst-case human displacement rate during the bounded action. */
  readonly maxHumanSpeedMps: number;
  /** Minimum validated braking capability for the robot/controller pair. */
  readonly minDecelerationMps2: number;
  /** Worst-case delay before braking begins. */
  readonly reactionTimeMs: number;
}

/**
 * Fixed cases plus an optional seeded perturbation distribution.
 * Coverage is the fraction of conclusive runs, not a probability estimate.
 */
export interface NavigationScenarioPolicy {
  readonly version: "1.0.0";
  readonly policyId: string;
  readonly cases: readonly NavigationStressCase[];
  /** Unique seeds draw one sample each. Fixed cases plus seeds stay within 16 runs. */
  readonly distribution?: SeededNavigationDistribution;
}

/** Approved support for deterministic navigation perturbations. */
export interface SeededNavigationDistribution {
  readonly version: "1.0.0";
  /** Unique integers in [0, 2^32). Order is part of the approved policy. */
  readonly seeds: readonly number[];
  readonly bounds: {
    readonly extraRobotRadiusMeters: NumericRange;
    readonly extraReactionTimeMs: NumericRange;
    readonly extraHumanSpeedMps: NumericRange;
  };
}

export interface NavigationStressCase {
  readonly id: string;
  readonly extraRobotRadiusMeters?: number;
  readonly extraReactionTimeMs?: number;
  readonly extraHumanSpeedMps?: number;
}

/** Approved support for deterministic bounded-motion perturbations. */
export interface SeededBoundedMotionDistribution {
  readonly version: "1.0.0";
  /** Unique integers in [0, 2^32). Order is part of the approved policy. */
  readonly seeds: readonly number[];
  readonly bounds: {
    readonly extraForceNewtons: NumericRange;
    readonly extraVelocityMps: NumericRange;
    readonly reducedClearanceMeters: NumericRange;
  };
}

export interface BoundedMotionStressCase {
  readonly id: string;
  readonly extraForceNewtons?: number;
  readonly extraVelocityMps?: number;
  readonly reducedClearanceMeters?: number;
}

/**
 * Fixed cases plus an optional seeded perturbation distribution.
 * Coverage is the fraction of conclusive runs, not a probability estimate.
 */
export interface BoundedMotionScenarioPolicy {
  readonly version: "1.0.0";
  readonly policyId: string;
  readonly cases: readonly BoundedMotionStressCase[];
  /** Unique seeds draw one sample each. Fixed cases plus seeds stay within 16 runs. */
  readonly distribution?: SeededBoundedMotionDistribution;
}
