/**
 * SINT Protocol — Engine Layer (L3) types.
 *
 * The Engine is the neuromorphic-symbolic runtime that runs on robots.
 * It integrates System 1 (neural perception) and System 2 (symbolic reasoning)
 * with a Hardware Abstraction Layer and Capsule Sandbox.
 *
 * Every engine action routes through the Policy Gateway — no exceptions.
 *
 * @module @sint/core/types/engine
 */

import type {
  DurationMs,
  ISO8601,
  MetersPerSecond,
  Newtons,
  Point3D,
  SHA256,
  SemVer,
  UUIDv7,
} from "./primitives.js";
import type { ApprovalTier } from "./policy.js";

// ---------------------------------------------------------------------------
// Sensor & Perception
// ---------------------------------------------------------------------------

/**
 * Supported sensor modalities for System 1 perception.
 */
export type SintSensorModality =
  | "camera_rgb"
  | "camera_depth"
  | "lidar"
  | "imu"
  | "force_torque"
  | "joint_state"
  | "gps"
  | "ultrasonic"
  | "infrared"
  | "microphone"
  | "tactile";

/**
 * A single sensor reading from one input source.
 *
 * @example
 * ```ts
 * const reading: SintSensorReading = {
 *   sensorId: "cam_front_rgb",
 *   modality: "camera_rgb",
 *   timestamp: "2026-03-17T10:00:00.000000Z",
 *   data: new Float32Array([...]),
 *   confidence: 0.97,
 * };
 * ```
 */
export interface SintSensorReading {
  /** Unique identifier for this sensor source. */
  readonly sensorId: string;
  /** Sensor modality type. */
  readonly modality: SintSensorModality;
  /** ISO 8601 timestamp when reading was captured. */
  readonly timestamp: ISO8601;
  /** Raw sensor data (type depends on modality). */
  readonly data: unknown;
  /** Confidence score in [0, 1]. */
  readonly confidence: number;
}

/**
 * A perceived object from the sensor fusion pipeline.
 */
export interface SintPerceivedObject {
  /** Classification label from the model. */
  readonly classLabel: string;
  /** Confidence score in [0, 1]. */
  readonly confidence: number;
  /** 3D bounding box: min and max corners. */
  readonly boundingBox3D: {
    readonly min: Point3D;
    readonly max: Point3D;
  };
  /** Whether this object is classified as a human. */
  readonly isHuman: boolean;
  /** Estimated velocity in m/s (if tracking is active). */
  readonly estimatedVelocity?: MetersPerSecond;
}

/**
 * Robot pose: position + orientation.
 */
export interface SintPose {
  /** Position in meters relative to reference frame. */
  readonly position: Point3D;
  /** Orientation as Euler angles in radians. */
  readonly orientation: {
    readonly roll: number;
    readonly pitch: number;
    readonly yaw: number;
  };
}

/**
 * An anomaly flag raised by the anomaly detector.
 */
export interface SintAnomalyFlag {
  /** Anomaly category. */
  readonly type: "distribution_shift" | "low_confidence" | "novelty" | "sensor_fault" | "collision_risk";
  /** Severity from 0 (info) to 1 (critical). */
  readonly severity: number;
  /** Source sensor or subsystem that raised the flag. */
  readonly source: string;
  /** Human-readable message. */
  readonly message: string;
}

/**
 * Fused world state from the perception pipeline.
 * This is System 1's output consumed by System 2.
 */
export interface SintWorldState {
  /** Timestamp of this world state snapshot. */
  readonly timestamp: ISO8601;
  /** Perceived objects in the scene. */
  readonly objects: readonly SintPerceivedObject[];
  /** Current robot pose estimate. */
  readonly robotPose: SintPose;
  /** Occupancy grid as boolean matrix (true = occupied). */
  readonly occupancyGrid?: readonly boolean[][];
  /** Active anomaly flags from the anomaly detector. */
  readonly anomalyFlags: readonly SintAnomalyFlag[];
  /** Whether any human is detected in the scene. */
  readonly humanPresent: boolean;
}

// ---------------------------------------------------------------------------
// Planning & Actions
// ---------------------------------------------------------------------------

/**
 * An action recommendation from System 1 (neural) or System 2 (symbolic).
 */
export interface SintActionRecommendation {
  /** Target resource URI (e.g. "ros2:///cmd_vel"). */
  readonly action: string;
  /** Resource being acted upon. */
  readonly resource: string;
  /** Action parameters. */
  readonly params: Record<string, unknown>;
  /** Confidence score in [0, 1]. */
  readonly confidence: number;
  /** Whether this action has safety implications. */
  readonly isSafetyRelevant: boolean;
}

/**
 * A single step in a task plan.
 */
export interface SintPlanStep {
  /** The action to execute. */
  readonly action: string;
  /** Target resource URI. */
  readonly resource: string;
  /** Parameters for this step. */
  readonly params: Record<string, unknown>;
  /** Minimum approval tier required for this step. */
  readonly requiredTier: ApprovalTier;
  /** Preconditions that must be true before execution. */
  readonly preconditions: readonly string[];
  /** Expected postconditions after execution. */
  readonly postconditions?: readonly string[];
}

/** Plan execution status. */
export type SintPlanStatus =
  | "pending"
  | "validating"
  | "approved"
  | "executing"
  | "completed"
  | "failed"
  | "aborted";

/**
 * A task plan generated by the System 2 planner.
 *
 * @example
 * ```ts
 * const plan: SintPlan = {
 *   planId: "01905f7c-...",
 *   goalId: "01905f7c-...",
 *   steps: [{ action: "navigate", resource: "ros2:///cmd_vel", ... }],
 *   estimatedDurationMs: 30000,
 *   status: "pending",
 *   createdAt: "2026-03-17T10:00:00.000000Z",
 * };
 * ```
 */
export interface SintPlan {
  /** Unique plan identifier. */
  readonly planId: UUIDv7;
  /** Goal this plan fulfills. */
  readonly goalId: UUIDv7;
  /** Ordered sequence of plan steps. */
  readonly steps: readonly SintPlanStep[];
  /** Estimated total duration in milliseconds. */
  readonly estimatedDurationMs: DurationMs;
  /** Current plan status. */
  readonly status: SintPlanStatus;
  /** When the plan was created. */
  readonly createdAt: ISO8601;
}

// ---------------------------------------------------------------------------
// Arbitration
// ---------------------------------------------------------------------------

/**
 * An arbitration decision between System 1 and System 2.
 * Critical invariant: System 2 ALWAYS wins on safety.
 */
export interface SintArbitrationDecision {
  /** System 1's recommendation. */
  readonly s1Recommendation: SintActionRecommendation;
  /** System 2's recommendation. */
  readonly s2Recommendation: SintActionRecommendation;
  /** Which system won the arbitration. */
  readonly winner: "system1" | "system2";
  /** Reason for the arbitration outcome. */
  readonly reason: string;
  /** Whether this was a safety override (System 2 overruled System 1). */
  readonly isSafetyOverride: boolean;
  /** Timestamp of the decision. */
  readonly decidedAt: ISO8601;
}

// ---------------------------------------------------------------------------
// Hardware Abstraction Layer
// ---------------------------------------------------------------------------

/** Deployment profiles for different hardware targets. */
export type SintHardwareDeploymentProfile = "full" | "edge" | "split" | "lite";

/**
 * Hardware profile detected by the HAL.
 *
 * @example
 * ```ts
 * const profile: SintHardwareProfile = {
 *   arch: "arm64",
 *   platform: "linux",
 *   cpuCores: 8,
 *   totalMemoryMB: 32768,
 *   gpuInfo: { name: "Jetson Orin", computeCapability: "8.7" },
 *   deploymentProfile: "full",
 * };
 * ```
 */
export interface SintHardwareProfile {
  /** CPU architecture (e.g. "x64", "arm64"). */
  readonly arch: string;
  /** Operating system platform (e.g. "linux", "darwin", "win32"). */
  readonly platform: string;
  /** Number of CPU cores available. */
  readonly cpuCores: number;
  /** Total system memory in megabytes. */
  readonly totalMemoryMB: number;
  /** GPU information (null if no GPU detected). */
  readonly gpuInfo: {
    readonly name: string;
    readonly computeCapability?: string;
    readonly memoryMB?: number;
  } | null;
  /** Selected deployment profile based on hardware capabilities. */
  readonly deploymentProfile: SintHardwareDeploymentProfile;
}

// ---------------------------------------------------------------------------
// Capsule Sandbox (SCS-1)
// ---------------------------------------------------------------------------

/**
 * Resource limits for capsule execution.
 */
export interface SintCapsuleResourceLimits {
  /** Maximum memory in megabytes. */
  readonly maxMemoryMB: number;
  /** Maximum CPU time per invocation in milliseconds. */
  readonly maxCpuTimeMs: DurationMs;
  /** Maximum persistent storage in megabytes. */
  readonly maxStorageMB: number;
}

/**
 * Safety declarations in a capsule manifest.
 * Capsules must declare their safety-relevant behaviors.
 */
export interface SintCapsuleSafetyDeclarations {
  /** Maximum force the capsule may command (Newtons). */
  readonly maxForceNewtons?: Newtons;
  /** Maximum velocity the capsule may command (m/s). */
  readonly maxVelocityMps?: MetersPerSecond;
  /** Whether the capsule requires human presence. */
  readonly requiresHumanPresence?: boolean;
  /** Whether the capsule can trigger emergency stop. */
  readonly canTriggerEstop?: boolean;
}

/**
 * SCS-1 Capsule Manifest — declares identity, capabilities,
 * resource requirements, and safety constraints.
 *
 * @example
 * ```ts
 * const manifest: SintCapsuleManifest = {
 *   capsuleId: "01905f7c-...",
 *   version: "1.0.0",
 *   name: "visual-inspection",
 *   author: "sint-labs",
 *   description: "Visual anomaly detection for manufacturing QA",
 *   sensors: ["camera_rgb"],
 *   actuators: [],
 *   safetyDeclarations: { requiresHumanPresence: false },
 *   resourceLimits: { maxMemoryMB: 256, maxCpuTimeMs: 5000, maxStorageMB: 50 },
 *   runtime: "typescript",
 *   entryPoint: "src/index.ts",
 *   contentHash: "abc123...",
 * };
 * ```
 */
export interface SintCapsuleManifest {
  /** Unique capsule identifier. */
  readonly capsuleId: UUIDv7;
  /** Semantic version. */
  readonly version: SemVer;
  /** Human-readable capsule name. */
  readonly name: string;
  /** Author or organization. */
  readonly author: string;
  /** Description of capsule purpose. */
  readonly description?: string;
  /** Required sensor modalities. */
  readonly sensors: readonly SintSensorModality[];
  /** Required actuator resources (e.g. "ros2:///gripper/open"). */
  readonly actuators: readonly string[];
  /** Safety constraint declarations. */
  readonly safetyDeclarations: SintCapsuleSafetyDeclarations;
  /** Resource usage limits. */
  readonly resourceLimits: SintCapsuleResourceLimits;
  /** Runtime environment ("wasm" or "typescript"). */
  readonly runtime: "wasm" | "typescript";
  /** Entry point file path within the capsule bundle. */
  readonly entryPoint: string;
  /** SHA-256 hash of the capsule bundle content. */
  readonly contentHash: SHA256;
}
