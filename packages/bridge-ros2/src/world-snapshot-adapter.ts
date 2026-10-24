import {
  canonicalJsonStringify,
  err,
  ok,
  type Result,
  type SHA256,
  type SimulationArtifactStore,
  type StoredSimulationArtifact,
  type SimulationWorldSnapshot,
} from "@pshkv/core";
import { hashSha256 } from "@pshkv/gate-capability-tokens";
import type { JointState, Odometry, Pose } from "./ros2-message-types.js";

export interface ROS2Stamped<T> {
  readonly observedAt: string;
  readonly value: T;
}

export interface ROS2TransformState {
  readonly parentFrame: string;
  readonly childFrame: string;
  readonly pose: Pose;
  readonly observedAt: string;
  readonly uncertainty?: number;
}

export interface ROS2MapState {
  readonly digest: SHA256;
  readonly frameId: string;
  readonly observedAt: string;
  readonly uncertainty?: number;
}

export interface ROS2ObstacleState {
  readonly id: string;
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly radiusMeters: number;
  readonly observedAt: string;
  readonly uncertainty?: number;
}

export interface ROS2SafetyControllerState {
  readonly controllerId: string;
  readonly observedAt: string;
  readonly permitState: "granted" | "denied" | "unknown";
  readonly estopEngaged: boolean;
  readonly protectiveStopEngaged: boolean;
  readonly safetyZoneClear: boolean;
  readonly stateDigest?: SHA256;
  readonly uncertainty?: number;
}

export type ROS2WorldStateSource =
  | "odometry"
  | "jointState"
  | "transforms"
  | "map"
  | "obstacles"
  | "safetyController";

export interface ROS2WorldStateInput {
  readonly robotId: string;
  readonly frameId: string;
  readonly stateEpoch: string;
  /** Time this multi-source aggregation completed. */
  readonly capturedAt: string;
  readonly odometry?: ROS2Stamped<Odometry>;
  readonly jointState?: ROS2Stamped<JointState>;
  readonly transforms?: readonly ROS2TransformState[];
  readonly map?: ROS2MapState;
  readonly obstacles?: readonly ROS2ObstacleState[];
  readonly safetyController?: ROS2SafetyControllerState;
  readonly localizationConfidence?: number;
}

/** Canonical state whose digest is placed in SimulationWorldSnapshot. */
export interface ROS2WorldSnapshotPayload extends ROS2WorldStateInput {
  readonly schemaVersion: "1.0.0";
}

export interface ROS2WorldSnapshotCapture {
  readonly snapshot: SimulationWorldSnapshot;
  readonly payload: ROS2WorldSnapshotPayload;
  readonly canonicalPayload: string;
}

export interface ROS2WorldSnapshotOptions {
  readonly validityMs?: number;
  readonly maxInputAgeMs?: number;
  readonly maxClockSkewMs?: number;
  readonly maxUncertainty?: number;
  readonly requiredSources?: readonly ROS2WorldStateSource[];
  readonly now?: () => number;
}

export interface ROS2WorldSnapshotError {
  readonly code:
    | "INVALID_WORLD_STATE"
    | "WORLD_STATE_SOURCE_MISSING"
    | "WORLD_STATE_SOURCE_STALE"
    | "WORLD_STATE_UNCERTAINTY_EXCEEDED";
  readonly message: string;
}

export interface ROS2WorldSnapshotPersistenceError {
  readonly code: "WORLD_SNAPSHOT_PERSISTENCE_FAILED" | "WORLD_SNAPSHOT_DIGEST_MISMATCH";
  readonly message: string;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNormalized(value: number | undefined): boolean {
  return value === undefined || (isFiniteNumber(value) && value >= 0 && value <= 1);
}

function isDigest(value: string | undefined): boolean {
  return value === undefined || /^[0-9a-f]{64}$/i.test(value);
}

function isFinitePose(pose: Pose): boolean {
  return [
    pose.position.x,
    pose.position.y,
    pose.position.z,
    pose.orientation.x,
    pose.orientation.y,
    pose.orientation.z,
    pose.orientation.w,
  ].every(isFiniteNumber);
}

function sourcePresent(input: ROS2WorldStateInput, source: ROS2WorldStateSource): boolean {
  const value = input[source];
  return Array.isArray(value) ? value.length > 0 : value !== undefined;
}

function sourceTimestamps(input: ROS2WorldStateInput): readonly string[] {
  return [
    input.odometry?.observedAt,
    input.jointState?.observedAt,
    ...(input.transforms ?? []).map((transform) => transform.observedAt),
    input.map?.observedAt,
    ...(input.obstacles ?? []).map((obstacle) => obstacle.observedAt),
    input.safetyController?.observedAt,
  ].filter((timestamp): timestamp is string => timestamp !== undefined);
}

function inputUncertainties(input: ROS2WorldStateInput): readonly number[] {
  return [
    input.localizationConfidence === undefined ? undefined : 1 - input.localizationConfidence,
    ...(input.transforms ?? []).map((transform) => transform.uncertainty),
    input.map?.uncertainty,
    ...(input.obstacles ?? []).map((obstacle) => obstacle.uncertainty),
    input.safetyController?.uncertainty,
  ].filter((uncertainty): uncertainty is number => uncertainty !== undefined);
}

function validateStructure(input: ROS2WorldStateInput): string | undefined {
  if (!input.robotId || !input.frameId || !input.stateEpoch) {
    return "robotId, frameId, and stateEpoch are required";
  }
  if (!isNormalized(input.localizationConfidence)) {
    return "localizationConfidence must be normalized to [0,1]";
  }
  const jointState = input.jointState?.value;
  if (jointState) {
    const count = jointState.name.length;
    if (
      count === 0
      || new Set(jointState.name).size !== count
      || jointState.position.length !== count
      || ![0, count].includes(jointState.velocity.length)
      || ![0, count].includes(jointState.effort.length)
      || [...jointState.position, ...jointState.velocity, ...jointState.effort].some((value) => !isFiniteNumber(value))
    ) {
      return "jointState arrays must align with unique joint names";
    }
  }
  if (
    input.odometry
    && (!isFinitePose(input.odometry.value.pose)
      || [
        input.odometry.value.twist.linear.x,
        input.odometry.value.twist.linear.y,
        input.odometry.value.twist.linear.z,
        input.odometry.value.twist.angular.x,
        input.odometry.value.twist.angular.y,
        input.odometry.value.twist.angular.z,
      ].some((value) => !isFiniteNumber(value)))
  ) {
    return "odometry pose and twist values must be finite";
  }
  const childFrames = (input.transforms ?? []).map((transform) => transform.childFrame);
  if (new Set(childFrames).size !== childFrames.length) {
    return "transform child frames must be unique within a snapshot";
  }
  for (const transform of input.transforms ?? []) {
    if (
      !transform.parentFrame
      || !transform.childFrame
      || !isFinitePose(transform.pose)
      || !isNormalized(transform.uncertainty)
    ) {
      return "transforms require frame identities and normalized uncertainty";
    }
  }
  if (input.map && (!input.map.frameId || !isDigest(input.map.digest) || !isNormalized(input.map.uncertainty))) {
    return "map digest or uncertainty is invalid";
  }
  const obstacleIds = (input.obstacles ?? []).map((obstacle) => obstacle.id);
  if (new Set(obstacleIds).size !== obstacleIds.length) {
    return "obstacle identities must be unique within a snapshot";
  }
  for (const obstacle of input.obstacles ?? []) {
    if (
      !obstacle.id
      || !isFiniteNumber(obstacle.position.x)
      || !isFiniteNumber(obstacle.position.y)
      || !isFiniteNumber(obstacle.position.z)
      || !isFiniteNumber(obstacle.radiusMeters)
      || obstacle.radiusMeters < 0
      || !isNormalized(obstacle.uncertainty)
    ) {
      return "obstacles require finite geometry and normalized uncertainty";
    }
  }
  if (
    input.safetyController
    && (!input.safetyController.controllerId
      || !isDigest(input.safetyController.stateDigest)
      || !isNormalized(input.safetyController.uncertainty))
  ) {
    return "safety-controller identity, digest, or uncertainty is invalid";
  }
  return undefined;
}

function canonicalizeInput(input: ROS2WorldStateInput): ROS2WorldStateInput {
  const jointState = input.jointState;
  const normalizedJointState = jointState
    ? {
        ...jointState,
        value: (() => {
          const rows = jointState.value.name.map((name, index) => ({
            name,
            position: jointState.value.position[index]!,
            velocity: jointState.value.velocity[index],
            effort: jointState.value.effort[index],
          })).sort((left, right) => left.name.localeCompare(right.name));
          return {
            name: rows.map((row) => row.name),
            position: rows.map((row) => row.position),
            velocity: jointState.value.velocity.length === 0
              ? []
              : rows.map((row) => row.velocity!),
            effort: jointState.value.effort.length === 0
              ? []
              : rows.map((row) => row.effort!),
          };
        })(),
      }
    : undefined;

  return {
    ...input,
    ...(normalizedJointState !== undefined && { jointState: normalizedJointState }),
    ...(input.transforms !== undefined && {
      transforms: [...input.transforms].sort((left, right) =>
        `${left.parentFrame}:${left.childFrame}`.localeCompare(`${right.parentFrame}:${right.childFrame}`)),
    }),
    ...(input.obstacles !== undefined && {
      obstacles: [...input.obstacles].sort((left, right) => left.id.localeCompare(right.id)),
    }),
  };
}

/**
 * Canonicalize a synchronized ROS 2 state bundle into a content-addressed,
 * short-lived world snapshot. This function captures evidence only and cannot
 * authorize or dispatch a ROS 2 command.
 */
export function createROS2WorldSnapshot(
  input: ROS2WorldStateInput,
  options: ROS2WorldSnapshotOptions = {},
): Result<ROS2WorldSnapshotCapture, ROS2WorldSnapshotError> {
  const structuralError = validateStructure(input);
  if (structuralError) {
    return err({ code: "INVALID_WORLD_STATE", message: structuralError });
  }

  const physicalSources = sourceTimestamps(input);
  if (physicalSources.length === 0) {
    return err({
      code: "WORLD_STATE_SOURCE_MISSING",
      message: "At least one timestamped ROS 2 world-state source is required",
    });
  }
  for (const required of options.requiredSources ?? []) {
    if (!sourcePresent(input, required)) {
      return err({
        code: "WORLD_STATE_SOURCE_MISSING",
        message: `Required ROS 2 world-state source ${required} is missing`,
      });
    }
  }

  const now = options.now?.() ?? Date.now();
  const capturedAt = Date.parse(input.capturedAt);
  const maxClockSkewMs = options.maxClockSkewMs ?? 250;
  const maxInputAgeMs = options.maxInputAgeMs ?? 1_000;
  const timestamps = [input.capturedAt, ...physicalSources].map(Date.parse);
  if (
    !Number.isFinite(capturedAt)
    || timestamps.some((timestamp) => !Number.isFinite(timestamp))
    || timestamps.some((timestamp) => timestamp > now + maxClockSkewMs)
    || timestamps.some((timestamp) => timestamp > capturedAt + maxClockSkewMs)
    || timestamps.some((timestamp) => capturedAt - timestamp > maxInputAgeMs)
    || now - capturedAt > maxInputAgeMs
    || capturedAt > now + maxClockSkewMs
  ) {
    return err({
      code: "WORLD_STATE_SOURCE_STALE",
      message: "ROS 2 world-state inputs are stale, invalid, or future-dated",
    });
  }

  const uncertainties = inputUncertainties(input);
  if (uncertainties.some((uncertainty) => !isNormalized(uncertainty))) {
    return err({ code: "INVALID_WORLD_STATE", message: "All uncertainty values must be normalized to [0,1]" });
  }
  const uncertainty = uncertainties.length > 0 ? Math.max(...uncertainties) : undefined;
  if (options.maxUncertainty !== undefined && !isNormalized(options.maxUncertainty)) {
    return err({ code: "INVALID_WORLD_STATE", message: "maxUncertainty must be normalized to [0,1]" });
  }
  if (options.maxUncertainty !== undefined && (uncertainty === undefined || uncertainty > options.maxUncertainty)) {
    return err({
      code: "WORLD_STATE_UNCERTAINTY_EXCEEDED",
      message: "Aggregated ROS 2 world-state uncertainty exceeds the configured limit",
    });
  }

  const payload: ROS2WorldSnapshotPayload = {
    schemaVersion: "1.0.0",
    ...canonicalizeInput(input),
  };
  const canonicalPayload = canonicalJsonStringify(payload);
  const validityMs = options.validityMs ?? 1_000;
  if (!Number.isFinite(validityMs) || validityMs <= 0) {
    return err({ code: "INVALID_WORLD_STATE", message: "Snapshot validityMs must be positive" });
  }
  if (capturedAt + validityMs <= now) {
    return err({ code: "WORLD_STATE_SOURCE_STALE", message: "ROS 2 world snapshot would already be expired" });
  }

  return ok({
    payload,
    canonicalPayload,
    snapshot: {
      digest: hashSha256(canonicalPayload),
      observedAt: input.capturedAt,
      validUntil: new Date(capturedAt + validityMs).toISOString(),
      stateEpoch: input.stateEpoch,
      ...(uncertainty !== undefined && { uncertainty }),
    },
  });
}

/** Persist the exact canonical payload addressed by `snapshot.digest`. */
export async function persistROS2WorldSnapshot(
  capture: ROS2WorldSnapshotCapture,
  artifactStore: SimulationArtifactStore,
): Promise<Result<StoredSimulationArtifact, ROS2WorldSnapshotPersistenceError>> {
  const persisted = await artifactStore.put({
    mediaType: "application/vnd.sint.ros2-world-snapshot+json;version=1",
    content: capture.canonicalPayload,
  });
  if (!persisted.ok) {
    return err({ code: "WORLD_SNAPSHOT_PERSISTENCE_FAILED", message: persisted.error.message });
  }
  if (persisted.value.digest !== capture.snapshot.digest) {
    return err({
      code: "WORLD_SNAPSHOT_DIGEST_MISMATCH",
      message: "Artifact store returned a digest that does not match the ROS 2 world snapshot",
    });
  }
  return ok(persisted.value);
}
