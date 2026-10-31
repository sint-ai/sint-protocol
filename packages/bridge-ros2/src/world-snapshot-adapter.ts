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
  readonly frameId?: string;
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
  readonly frameId?: string;
  /** A missing classification is unsupported by scene-aware validation. */
  readonly kind?: "static" | "dynamic" | "human";
  readonly position: { readonly x: number; readonly y: number; readonly z: number };
  readonly velocityMps?: { readonly x: number; readonly y: number; readonly z: number };
  /** Absolute speed prediction error bound in metres per second for moving objects. */
  readonly velocityUncertaintyMps?: number;
  /** Absolute position bound in metres, including sensor and tracking error. */
  readonly positionUncertaintyMeters?: number;
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

export interface ROS2PayloadGeometry {
  readonly payloadId: string;
  readonly digest: string;
  readonly radiusMeters: number;
}

export interface ROS2TaskBinding {
  readonly phase: string;
  readonly toolId?: string;
  readonly payload?: ROS2PayloadGeometry;
  readonly calibrationDigest: string;
  readonly policyDigest: string;
}

export type ROS2WorldStateSource =
  | "odometry"
  | "jointState"
  | "transforms"
  | "map"
  | "obstacles"
  | "safetyController";

export interface ROS2SensorSource {
  readonly sensorId: string;
  readonly version: string;
  readonly source: ROS2WorldStateSource;
  readonly observedAt: string;
}

export interface ROS2SensorProvenance {
  readonly schemaVersion: "1.0.0";
  readonly sensors: readonly ROS2SensorSource[];
}

export type ROS2OcclusionState = "clear" | "partial" | "occluded" | "unknown";

export interface ROS2OccupancyRegion {
  readonly regionId: string;
  readonly occupied: boolean;
  readonly occlusion: ROS2OcclusionState;
  readonly observedAt: string;
}

export interface ROS2OccupancyOcclusion {
  readonly schemaVersion: "1.0.0";
  readonly regions: readonly ROS2OccupancyRegion[];
}

export interface ROS2WorldStateInput {
  readonly robotId: string;
  readonly frameId: string;
  readonly stateEpoch: string;
  /** Time this multi-source aggregation completed. */
  readonly capturedAt: string;
  /** Absolute localization error bound in metres for scene-aware checks. */
  readonly robotPositionUncertaintyMeters?: number;
  readonly odometry?: ROS2Stamped<Odometry>;
  readonly jointState?: ROS2Stamped<JointState>;
  readonly transforms?: readonly ROS2TransformState[];
  readonly map?: ROS2MapState;
  readonly obstacles?: readonly ROS2ObstacleState[];
  /** Sensor fusion completion time, including a scan that found zero obstacles. */
  readonly obstacleScanObservedAt?: string;
  readonly safetyController?: ROS2SafetyControllerState;
  readonly localizationConfidence?: number;
  /** Task phase, tool, payload geometry, and the calibration and policy digests in force. */
  readonly task?: ROS2TaskBinding;
  /** Sensor identities that produced this capture. Versioned onto the canonical snapshot. */
  readonly sensors?: readonly ROS2SensorSource[];
  /** Region occupancy and occlusion. Versioned onto the canonical snapshot. */
  readonly occupancy?: readonly ROS2OccupancyRegion[];
}

/** Canonical state whose digest is placed in SimulationWorldSnapshot. */
export interface ROS2WorldSnapshotPayload extends Omit<ROS2WorldStateInput, "sensors" | "occupancy"> {
  readonly schemaVersion: "1.0.0";
  readonly sensorProvenance?: ROS2SensorProvenance;
  readonly occupancyOcclusion?: ROS2OccupancyOcclusion;
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

function isUnitQuaternion(orientation: Pose["orientation"]): boolean {
  const normSquared = orientation.x ** 2 + orientation.y ** 2 + orientation.z ** 2 + orientation.w ** 2;
  return Math.abs(normSquared - 1) <= 1e-6;
}

function sourcePresent(input: ROS2WorldStateInput, source: ROS2WorldStateSource): boolean {
  if (source === "obstacles") {
    return Array.isArray(input.obstacles)
      && (input.obstacles.length > 0 || input.obstacleScanObservedAt !== undefined);
  }
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
    input.obstacleScanObservedAt,
    input.safetyController?.observedAt,
    ...(input.sensors ?? []).map((sensor) => sensor.observedAt),
    ...(input.occupancy ?? []).map((region) => region.observedAt),
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
  if (
    input.robotId.trim().length === 0
    || input.robotId !== input.robotId.trim()
    || input.frameId.trim().length === 0
    || input.frameId !== input.frameId.trim()
    || !input.stateEpoch
  ) {
    return "robotId, frameId, and stateEpoch are required";
  }
  const epochRobot = input.stateEpoch.indexOf(":");
  if (epochRobot < 0) {
    return "stateEpoch does not name robotId";
  }
  if (input.stateEpoch.slice(0, epochRobot) !== input.robotId) {
    return "stateEpoch names a different robot than robotId";
  }
  const epochCounter = input.stateEpoch.slice(epochRobot + 1);
  if (epochCounter.length === 0) {
    return "stateEpoch counter is empty";
  }
  if (!/^(0|[1-9][0-9]*)$/.test(epochCounter)) {
    return "stateEpoch counter is not a canonical integer";
  }
  if (!isNormalized(input.localizationConfidence)) {
    return "localizationConfidence must be normalized to [0,1]";
  }
  if (input.robotPositionUncertaintyMeters !== undefined
    && (!isFiniteNumber(input.robotPositionUncertaintyMeters) || input.robotPositionUncertaintyMeters < 0)) {
    return "robotPositionUncertaintyMeters must be finite and nonnegative";
  }
  if (typeof input.capturedAt !== "string" || input.capturedAt.trim().length === 0) {
    return "capture time is missing";
  }
  if (input.capturedAt !== input.capturedAt.trim()) {
    return "capture time has leading or trailing whitespace";
  }
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.capturedAt)
    || !Number.isFinite(Date.parse(input.capturedAt))
    || new Date(input.capturedAt).toISOString() !== input.capturedAt
  ) {
    return "capture time is not canonical UTC";
  }
  if (
    input.obstacleScanObservedAt !== undefined
    && (typeof input.obstacleScanObservedAt !== "string"
      || input.obstacleScanObservedAt.trim().length === 0
      || input.obstacleScanObservedAt !== input.obstacleScanObservedAt.trim())
  ) {
    return "obstacle scan observation time is missing";
  }
  if (
    input.obstacleScanObservedAt !== undefined
    && (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.obstacleScanObservedAt)
      || !Number.isFinite(Date.parse(input.obstacleScanObservedAt))
      || new Date(input.obstacleScanObservedAt).toISOString() !== input.obstacleScanObservedAt
    )
  ) {
    return "obstacle scan observation time is not canonical UTC";
  }
  if (
    input.obstacleScanObservedAt !== undefined
    && !Array.isArray(input.obstacles)
  ) {
    return "obstacle scan observation time has no obstacle list";
  }
  if (
    input.jointState
    && (typeof input.jointState.observedAt !== "string"
      || input.jointState.observedAt.trim().length === 0
      || input.jointState.observedAt !== input.jointState.observedAt.trim())
  ) {
    return "joint state observation time is missing";
  }
  if (
    input.jointState
    && (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.jointState.observedAt)
      || !Number.isFinite(Date.parse(input.jointState.observedAt))
      || new Date(input.jointState.observedAt).toISOString() !== input.jointState.observedAt
    )
  ) {
    return "joint state observation time is not canonical UTC";
  }
  const jointState = input.jointState?.value;
  if (jointState) {
    const count = jointState.name.length;
    if (
      count === 0
      || jointState.name.some((name) => name.trim().length === 0 || name !== name.trim())
      || new Set(jointState.name.map((name) => name.trim())).size !== count
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
    && (typeof input.odometry.observedAt !== "string"
      || input.odometry.observedAt.trim().length === 0
      || input.odometry.observedAt !== input.odometry.observedAt.trim()
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.odometry.observedAt)
      || !Number.isFinite(Date.parse(input.odometry.observedAt))
      || new Date(input.odometry.observedAt).toISOString() !== input.odometry.observedAt
      || (input.odometry.frameId !== undefined && input.odometry.frameId.trim().length === 0)
      || !isFinitePose(input.odometry.value.pose)
      || !isUnitQuaternion(input.odometry.value.pose.orientation)
      || [
        input.odometry.value.twist.linear.x,
        input.odometry.value.twist.linear.y,
        input.odometry.value.twist.linear.z,
        input.odometry.value.twist.angular.x,
        input.odometry.value.twist.angular.y,
        input.odometry.value.twist.angular.z,
      ].some((value) => !isFiniteNumber(value)))
  ) {
    return "odometry observation time, pose, or twist is invalid";
  }
  if (input.odometry && input.odometry.value.pose.position.z !== 0) {
    return "odometry vertical position is not zero";
  }
  if (input.odometry && input.odometry.value.twist.linear.z !== 0) {
    return "odometry vertical velocity is not zero";
  }
  if (input.odometry && input.odometry.value.twist.angular.x !== 0) {
    return "odometry roll rate is not zero";
  }
  if (input.odometry && input.odometry.value.twist.angular.y !== 0) {
    return "odometry pitch rate is not zero";
  }
  if (input.odometry && input.odometry.value.pose.orientation.x !== 0) {
    return "odometry roll is not zero";
  }
  const childFrames = (input.transforms ?? []).map((transform) => transform.childFrame.trim());
  if (new Set(childFrames).size !== childFrames.length) {
    return "transform child frames must be unique within a snapshot";
  }
  for (const transform of input.transforms ?? []) {
    if (
      typeof transform.observedAt !== "string"
      || transform.observedAt.trim().length === 0
      || transform.observedAt !== transform.observedAt.trim()
      || transform.parentFrame.trim().length === 0
      || transform.parentFrame !== transform.parentFrame.trim()
      || transform.childFrame.trim().length === 0
      || transform.childFrame !== transform.childFrame.trim()
      || !isFinitePose(transform.pose)
      || !isUnitQuaternion(transform.pose.orientation)
      || !isNormalized(transform.uncertainty)
    ) {
      return "transforms require an observation time, frame identities, and normalized uncertainty";
    }
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(transform.observedAt)
      || !Number.isFinite(Date.parse(transform.observedAt))
      || new Date(transform.observedAt).toISOString() !== transform.observedAt
    ) {
      return "transform observation time is not canonical UTC";
    }
  }
  if (
    input.map
    && (typeof input.map.observedAt !== "string"
      || input.map.observedAt.trim().length === 0
      || input.map.observedAt !== input.map.observedAt.trim()
      || input.map.frameId.trim().length === 0
      || !isContentDigest(input.map.digest)
      || !isNormalized(input.map.uncertainty))
  ) {
    return "map observation time, digest, or uncertainty is invalid";
  }
  if (
    input.map
    && (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.map.observedAt)
      || !Number.isFinite(Date.parse(input.map.observedAt))
      || new Date(input.map.observedAt).toISOString() !== input.map.observedAt
    )
  ) {
    return "map observation time is not canonical UTC";
  }
  const obstacleIds = (input.obstacles ?? []).map((obstacle) => obstacle.id.trim());
  if (new Set(obstacleIds).size !== obstacleIds.length) {
    return "obstacle identities must be unique within a snapshot";
  }
  for (const obstacle of input.obstacles ?? []) {
    if (
      typeof obstacle.observedAt !== "string"
      || obstacle.observedAt.trim().length === 0
      || obstacle.observedAt !== obstacle.observedAt.trim()
      || obstacle.id.trim().length === 0
      || obstacle.id !== obstacle.id.trim()
      || (obstacle.frameId !== undefined && obstacle.frameId.trim().length === 0)
      || !isFiniteNumber(obstacle.position.x)
      || !isFiniteNumber(obstacle.position.y)
      || !isFiniteNumber(obstacle.position.z)
      || !isFiniteNumber(obstacle.radiusMeters)
      || obstacle.radiusMeters < 0
      || (obstacle.positionUncertaintyMeters !== undefined
        && (!isFiniteNumber(obstacle.positionUncertaintyMeters) || obstacle.positionUncertaintyMeters < 0))
      || (obstacle.velocityMps !== undefined
        && ![obstacle.velocityMps.x, obstacle.velocityMps.y, obstacle.velocityMps.z].every(isFiniteNumber))
      || (obstacle.velocityUncertaintyMps !== undefined
        && (!isFiniteNumber(obstacle.velocityUncertaintyMps) || obstacle.velocityUncertaintyMps < 0))
      || (obstacle.kind !== undefined && !["static", "dynamic", "human"].includes(obstacle.kind))
      || !isNormalized(obstacle.uncertainty)
    ) {
      return "obstacles require an observation time, finite geometry, and normalized uncertainty";
    }
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(obstacle.observedAt)
      || !Number.isFinite(Date.parse(obstacle.observedAt))
      || new Date(obstacle.observedAt).toISOString() !== obstacle.observedAt
    ) {
      return "obstacle observation time is not canonical UTC";
    }
    if (
      obstacle.kind === "static"
      && obstacle.velocityMps !== undefined
      && (obstacle.velocityMps.x !== 0 || obstacle.velocityMps.y !== 0 || obstacle.velocityMps.z !== 0)
    ) {
      return "static obstacle velocity is not zero";
    }
    if (obstacle.kind === "dynamic" && obstacle.velocityMps === undefined) {
      return "dynamic obstacle requires a velocity";
    }
    if (
      obstacle.kind === "static"
      && obstacle.velocityUncertaintyMps !== undefined
      && obstacle.velocityUncertaintyMps > 0
    ) {
      return "static obstacle velocity uncertainty is not zero";
    }
    if (
      obstacle.kind === "human"
      && obstacle.velocityUncertaintyMps !== undefined
      && obstacle.velocityUncertaintyMps > 0
    ) {
      return "human obstacle velocity uncertainty is not zero";
    }
    if (
      obstacle.kind === "dynamic"
      && obstacle.velocityMps !== undefined
      && obstacle.velocityMps.z !== 0
    ) {
      return "dynamic obstacle vertical velocity is not zero";
    }
    if (
      obstacle.kind === "human"
      && obstacle.velocityMps !== undefined
      && obstacle.velocityMps.z !== 0
    ) {
      return "human obstacle vertical velocity is not zero";
    }
    if (obstacle.kind === "static" && obstacle.position.z !== 0) {
      return "static obstacle vertical position is not zero";
    }
    if (obstacle.kind === "dynamic" && obstacle.position.z !== 0) {
      return "dynamic obstacle vertical position is not zero";
    }
    if (obstacle.kind === "human" && obstacle.position.z !== 0) {
      return "human obstacle vertical position is not zero";
    }
  }
  if (
    input.obstacleScanObservedAt !== undefined
    && (input.obstacles ?? []).some((obstacle) => obstacle.observedAt !== input.obstacleScanObservedAt)
  ) {
    return "obstacle observation time does not match the obstacle scan";
  }
  if (
    input.safetyController
    && (input.safetyController.controllerId.trim().length === 0
      || input.safetyController.controllerId !== input.safetyController.controllerId.trim()
      || !isContentDigest(input.safetyController.stateDigest)
      || !isPermitState(input.safetyController.permitState)
      || typeof input.safetyController.estopEngaged !== "boolean"
      || typeof input.safetyController.protectiveStopEngaged !== "boolean"
      || typeof input.safetyController.safetyZoneClear !== "boolean"
      || typeof input.safetyController.observedAt !== "string"
      || input.safetyController.observedAt.trim().length === 0
      || input.safetyController.observedAt !== input.safetyController.observedAt.trim()
      || !isNormalized(input.safetyController.uncertainty))
  ) {
    return "safety-controller identity, digest, permit state, flag, observation time, or uncertainty is invalid";
  }
  if (
    input.safetyController
    && (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.safetyController.observedAt)
      || !Number.isFinite(Date.parse(input.safetyController.observedAt))
      || new Date(input.safetyController.observedAt).toISOString() !== input.safetyController.observedAt
    )
  ) {
    return "safety-controller observation time is not canonical UTC";
  }
  return validateTask(input.task)
    ?? validateSensors(input)
    ?? validateOccupancy(input.occupancy)
    ?? validateCrossSourceFrames(input);
}

function sourceFrameDisagrees(snapshotFrame: string, frameId: string | undefined): boolean {
  return frameId !== undefined && frameId !== snapshotFrame;
}

/** A declared odometry, map, or obstacle frame must be the snapshot frame. */
function validateCrossSourceFrames(input: ROS2WorldStateInput): string | undefined {
  if (sourceFrameDisagrees(input.frameId, input.odometry?.frameId)) {
    return "odometry frame does not match the snapshot frame";
  }
  if (sourceFrameDisagrees(input.frameId, input.jointState?.frameId)) {
    return "joint-state frame does not match the snapshot frame";
  }
  for (const transform of input.transforms ?? []) {
    if (transform.parentFrame !== input.frameId) {
      return "transform parent frame does not match the snapshot frame";
    }
    if (transform.childFrame === transform.parentFrame) {
      return "transform child frame matches the parent frame";
    }
  }
  if (input.map !== undefined && input.map.frameId !== input.frameId) {
    return "map frame does not match the snapshot frame";
  }
  for (const obstacle of input.obstacles ?? []) {
    if (sourceFrameDisagrees(input.frameId, obstacle.frameId)) {
      return "obstacle frame does not match the snapshot frame";
    }
  }
  return undefined;
}

const OCCLUSION_STATES: readonly ROS2OcclusionState[] = [
  "clear",
  "partial",
  "occluded",
  "unknown",
];

function validateOccupancy(
  regions: readonly ROS2OccupancyRegion[] | undefined,
): string | undefined {
  if (regions === undefined) return undefined;
  const regionIds = regions.map((region) => region.regionId.trim());
  if (new Set(regionIds).size !== regionIds.length) {
    return "occupancy region identities must be unique within a snapshot";
  }
  for (const region of regions) {
    if (
      typeof region.observedAt !== "string"
      || region.observedAt.trim().length === 0
      || region.observedAt !== region.observedAt.trim()
    ) {
      return "occupancy observation time is missing";
    }
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(region.observedAt)
      || !Number.isFinite(Date.parse(region.observedAt))
      || new Date(region.observedAt).toISOString() !== region.observedAt
    ) {
      return "occupancy observation time is not canonical UTC";
    }
    if (region.regionId.trim().length === 0 || region.regionId !== region.regionId.trim()) {
      return "occupancy region identity is missing";
    }
    if (typeof region.occupied !== "boolean") {
      return "occupancy occupied flag is not a boolean";
    }
    if (!region.occlusion) {
      return "occupancy occlusion state is missing";
    }
    if (!OCCLUSION_STATES.includes(region.occlusion)) {
      return "occupancy occlusion state is invalid";
    }
  }
  return undefined;
}

const WORLD_STATE_SOURCES: readonly ROS2WorldStateSource[] = [
  "odometry",
  "jointState",
  "transforms",
  "map",
  "obstacles",
  "safetyController",
];

function validateSensors(input: ROS2WorldStateInput): string | undefined {
  const sensors = input.sensors;
  if (sensors === undefined) return undefined;
  const sensorIds = sensors.map((sensor) => sensor.sensorId.trim());
  if (new Set(sensorIds).size !== sensorIds.length) {
    return "sensor identities must be unique within a snapshot";
  }
  for (const sensor of sensors) {
    if (
      typeof sensor.observedAt !== "string"
      || sensor.observedAt.trim().length === 0
      || sensor.observedAt !== sensor.observedAt.trim()
    ) {
      return "sensor provenance observation time is missing";
    }
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(sensor.observedAt)
      || !Number.isFinite(Date.parse(sensor.observedAt))
      || new Date(sensor.observedAt).toISOString() !== sensor.observedAt
    ) {
      return "sensor provenance observation time is not canonical UTC";
    }
    if (sensor.sensorId.trim().length === 0 || sensor.sensorId !== sensor.sensorId.trim()) {
      return "sensor provenance identity is missing";
    }
    if (sensor.version.trim().length === 0 || sensor.version !== sensor.version.trim()) {
      return "sensor provenance version is missing";
    }
    if (!WORLD_STATE_SOURCES.includes(sensor.source)) {
      return "sensor provenance source is invalid";
    }
    if (!sourcePresent(input, sensor.source)) {
      return "sensor provenance names a world-state source that is not present";
    }
    if (sensor.source === "odometry" && sensor.observedAt !== input.odometry?.observedAt) {
      return "sensor provenance observation time does not match odometry";
    }
    if (sensor.source === "jointState" && sensor.observedAt !== input.jointState?.observedAt) {
      return "sensor provenance observation time does not match joint state";
    }
    if (
      sensor.source === "transforms"
      && (input.transforms ?? []).some((transform) => transform.observedAt !== sensor.observedAt)
    ) {
      return "sensor provenance observation time does not match transforms";
    }
    if (sensor.source === "map" && sensor.observedAt !== input.map?.observedAt) {
      return "sensor provenance observation time does not match the map";
    }
    if (
      sensor.source === "obstacles"
      && (input.obstacles ?? []).some((obstacle) => obstacle.observedAt !== sensor.observedAt)
    ) {
      return "sensor provenance observation time does not match obstacles";
    }
    if (
      sensor.source === "obstacles"
      && (input.obstacles ?? []).length === 0
      && input.obstacleScanObservedAt !== undefined
      && sensor.observedAt !== input.obstacleScanObservedAt
    ) {
      return "sensor provenance observation time does not match the empty obstacle scan";
    }
    if (
      sensor.source === "obstacles"
      && (input.obstacles ?? []).length > 0
      && input.obstacleScanObservedAt !== undefined
      && sensor.observedAt !== input.obstacleScanObservedAt
    ) {
      return "sensor provenance observation time does not match the obstacle scan";
    }
    if (
      sensor.source === "safetyController"
      && sensor.observedAt !== input.safetyController?.observedAt
    ) {
      return "sensor provenance observation time does not match the safety controller";
    }
  }
  return undefined;
}

function isPermitState(value: unknown): boolean {
  return value === "granted" || value === "denied" || value === "unknown";
}

function isContentDigest(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

/** Hash of the versioned task, sensor provenance, and occupancy. Absent when none are present. */
function sceneContractDigest(payload: ROS2WorldSnapshotPayload): string | undefined {
  if (
    payload.task === undefined
    && payload.sensorProvenance === undefined
    && payload.occupancyOcclusion === undefined
  ) {
    return undefined;
  }
  return hashSha256(canonicalJsonStringify({
    occupancyOcclusion: payload.occupancyOcclusion ?? null,
    sensorProvenance: payload.sensorProvenance ?? null,
    task: payload.task ?? null,
  }));
}

function validateTask(task: ROS2TaskBinding | undefined): string | undefined {
  if (task === undefined) return undefined;
  if (
    !task.phase
    || task.phase.trim().length === 0
    || task.phase !== task.phase.trim()
    || task.phase.length > 128
    || (task.toolId !== undefined && (task.toolId.trim().length === 0 || task.toolId !== task.toolId.trim()))
    || !isContentDigest(task.calibrationDigest)
    || !isContentDigest(task.policyDigest)
  ) {
    return "task phase, calibration digest, or policy digest is invalid";
  }
  const payload = task.payload;
  if (
    payload !== undefined
    && (payload.payloadId.trim().length === 0
      || payload.payloadId !== payload.payloadId.trim()
      || !isContentDigest(payload.digest)
      || !isFiniteNumber(payload.radiusMeters)
      || payload.radiusMeters < 0)
  ) {
    return "task payload identity, digest, or geometry is invalid";
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
    ...(input.sensors !== undefined && {
      sensors: [...input.sensors].sort((left, right) => left.sensorId.localeCompare(right.sensorId)),
    }),
    ...(input.occupancy !== undefined && {
      occupancy: [...input.occupancy].sort((left, right) => left.regionId.localeCompare(right.regionId)),
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

  const sourceTimes = physicalSources.map((timestamp) => Date.parse(timestamp));
  const earliestSource = Math.min(...sourceTimes);
  const latestSource = Math.max(...sourceTimes);
  if (latestSource - earliestSource > maxClockSkewMs) {
    return err({
      code: "INVALID_WORLD_STATE",
      message: "ROS 2 world-state source clocks disagree",
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

  const { sensors, occupancy, ...canonicalState } = canonicalizeInput(input);
  const payload: ROS2WorldSnapshotPayload = {
    schemaVersion: "1.0.0",
    ...canonicalState,
    ...(sensors !== undefined && {
      sensorProvenance: {
        schemaVersion: "1.0.0" as const,
        sensors,
      },
    }),
    ...(occupancy !== undefined && {
      occupancyOcclusion: {
        schemaVersion: "1.0.0" as const,
        regions: occupancy,
      },
    }),
  };
  const canonicalPayload = canonicalJsonStringify(payload);
  const contractDigest = sceneContractDigest(payload);
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
      ...(contractDigest !== undefined && { sceneContractDigest: contractDigest }),
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
