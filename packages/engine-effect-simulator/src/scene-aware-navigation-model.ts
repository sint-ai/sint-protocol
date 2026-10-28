import {
  err,
  ok,
  type EffectPlan,
  type EffectSimulationError,
  type Point3D,
  type Result,
  type SimulationSafetyResult,
  type SimulationWorldSnapshot,
} from "@pshkv/core";
import { hashSha256 } from "@pshkv/gate-capability-tokens";
import type {
  DeterministicCheckRecord,
  DeterministicCheckResult,
  DeterministicEffectModel,
  SceneAwareNavigationModelOptions,
} from "./types.js";

interface SceneObstacle {
  readonly id: string;
  readonly kind: "static" | "dynamic" | "human";
  readonly position: Point3D;
  readonly velocity: Point3D;
  readonly radiusMeters: number;
  readonly positionUncertaintyMeters: number;
  readonly observationAgeSeconds: number;
}

interface NavigationScene {
  readonly robotId: string;
  readonly frameId: string;
  readonly start: Point3D;
  readonly robotPositionUncertaintyMeters: number;
  readonly odometryAgeSeconds: number;
  readonly obstacles: readonly SceneObstacle[];
  readonly controllerPermitsMotion: boolean;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function nonnegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function point(value: unknown): Point3D | undefined {
  const object = record(value);
  return object && [object.x, object.y, object.z].every((part) => typeof part === "number" && Number.isFinite(part))
    ? { x: object.x as number, y: object.y as number, z: object.z as number }
    : undefined;
}

function sourceFresh(value: unknown, observedAt: number, maxSourceAgeMs: number): boolean {
  if (typeof value !== "string") return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= observedAt && observedAt - time <= maxSourceAgeMs;
}

/** Validate the subset of the canonical ROS 2 scene needed for navigation. */
function readScene(
  value: unknown,
  snapshot: SimulationWorldSnapshot,
  maxSourceAgeMs: number,
): Result<NavigationScene, string> {
  const scene = record(value);
  const odometry = record(scene?.odometry);
  const odometryValue = record(odometry?.value);
  const pose = record(odometryValue?.pose);
  const map = record(scene?.map);
  const safety = record(scene?.safetyController);
  const start = point(pose?.position);
  const observedAt = Date.parse(snapshot.observedAt);
  if (
    scene?.schemaVersion !== "1.0.0"
    || typeof scene.robotId !== "string"
    || scene.robotId.length === 0
    || typeof scene.frameId !== "string"
    || scene.frameId.length === 0
    || scene.capturedAt !== snapshot.observedAt
    || scene.stateEpoch !== snapshot.stateEpoch
    || map?.frameId !== scene.frameId
    || !Number.isFinite(observedAt)
    || !start
    || !nonnegative(scene.robotPositionUncertaintyMeters)
    || !Array.isArray(scene.obstacles)
    || !sourceFresh(odometry?.observedAt, observedAt, maxSourceAgeMs)
    || !sourceFresh(map?.observedAt, observedAt, maxSourceAgeMs)
    || !sourceFresh(scene.obstacleScanObservedAt, observedAt, maxSourceAgeMs)
    || !sourceFresh(safety?.observedAt, observedAt, maxSourceAgeMs)
  ) {
    return err("Scene is missing synchronized pose, map, obstacle scan, uncertainty, or controller state");
  }

  const obstacles: SceneObstacle[] = [];
  const ids = new Set<string>();
  for (const raw of scene.obstacles) {
    const obstacle = record(raw);
    const position = point(obstacle?.position);
    const kind = obstacle?.kind;
    const velocity = point(obstacle?.velocityMps);
    if (
      typeof obstacle?.id !== "string"
      || obstacle.id.length === 0
      || ids.has(obstacle.id)
      || (kind !== "static" && kind !== "dynamic" && kind !== "human")
      || !position
      || !nonnegative(obstacle.radiusMeters)
      || !nonnegative(obstacle.positionUncertaintyMeters)
      || !sourceFresh(obstacle.observedAt, observedAt, maxSourceAgeMs)
      || (kind === "dynamic" && !velocity)
      || (kind === "static" && velocity !== undefined
        && (velocity.x !== 0 || velocity.y !== 0 || velocity.z !== 0))
    ) {
      return err("An obstacle has missing geometry, motion classification, uncertainty, or a stale observation");
    }
    ids.add(obstacle.id);
    obstacles.push({
      id: obstacle.id,
      kind,
      position,
      velocity: velocity ?? { x: 0, y: 0, z: 0 },
      radiusMeters: obstacle.radiusMeters,
      positionUncertaintyMeters: obstacle.positionUncertaintyMeters,
      observationAgeSeconds: (observedAt - Date.parse(obstacle.observedAt as string)) / 1_000,
    });
  }

  return ok({
    robotId: scene.robotId,
    frameId: scene.frameId,
    start,
    robotPositionUncertaintyMeters: scene.robotPositionUncertaintyMeters,
    odometryAgeSeconds: (observedAt - Date.parse(odometry?.observedAt as string)) / 1_000,
    obstacles,
    controllerPermitsMotion: safety?.permitState === "granted"
      && safety.estopEngaged === false
      && safety.protectiveStopEngaged === false
      && safety.safetyZoneClear === true,
  });
}

function indeterminate(reason: string): DeterministicCheckResult {
  return {
    checks: [{ check: "scene-validity", status: "unknown", expected: reason }],
    result: {
      outcome: "indeterminate",
      collisions: 0,
      safetyZoneViolations: 0,
      assumptions: [reason],
    },
  };
}

function closestClearance(
  start: Point3D,
  target: Point3D,
  durationSeconds: number,
  obstacle: SceneObstacle,
  robotRadiusMeters: number,
  robotUncertaintyMeters: number,
  maxHumanSpeedMps: number,
): number {
  const robotVx = (target.x - start.x) / durationSeconds;
  const robotVy = (target.y - start.y) / durationSeconds;
  const obstacleStartX = obstacle.position.x + (obstacle.kind === "dynamic" ? obstacle.velocity.x * obstacle.observationAgeSeconds : 0);
  const obstacleStartY = obstacle.position.y + (obstacle.kind === "dynamic" ? obstacle.velocity.y * obstacle.observationAgeSeconds : 0);
  const dx = start.x - obstacleStartX;
  const dy = start.y - obstacleStartY;
  // Human reachability is centered on the observed position, not a single
  // predicted path. The full speed bound covers any direction of movement.
  const vx = robotVx - (obstacle.kind === "human" ? 0 : obstacle.velocity.x);
  const vy = robotVy - (obstacle.kind === "human" ? 0 : obstacle.velocity.y);
  const speedSquared = vx * vx + vy * vy;
  const nearestTime = speedSquared === 0
    ? 0
    : Math.max(0, Math.min(durationSeconds, -(dx * vx + dy * vy) / speedSquared));
  const separation = Math.hypot(dx + vx * nearestTime, dy + vy * nearestTime);
  const humanReach = obstacle.kind === "human"
    ? maxHumanSpeedMps * (obstacle.observationAgeSeconds + durationSeconds)
    : 0;
  return separation - robotRadiusMeters - robotUncertaintyMeters
    - obstacle.radiusMeters - obstacle.positionUncertaintyMeters - humanReach;
}

/**
 * Short-horizon, planar navigation checker over a stored ROS 2 scene.
 * It does not model contact, actuator lag, or a controller-rate safety shield.
 */
export class SceneAwareNavigationModel implements DeterministicEffectModel {
  readonly id: string;

  constructor(private readonly options: SceneAwareNavigationModelOptions) {
    this.id = options.id ?? "scene-aware-navigation-v1";
  }

  supports(effectPlan: EffectPlan): boolean {
    return this.options.actions.includes(effectPlan.action)
      && this.options.resources.some((resource) => typeof resource === "string"
        ? resource === effectPlan.resource
        : resource.test(effectPlan.resource));
  }

  async evaluate(
    effectPlan: EffectPlan,
    worldSnapshot: SimulationWorldSnapshot,
  ): Promise<Result<DeterministicCheckResult, EffectSimulationError>> {
    const { robotRadiusMeters, minClearanceMeters, maxVelocityMps, maxHorizonMs, maxHumanSpeedMps } = this.options;
    if (
      ![robotRadiusMeters, minClearanceMeters, maxVelocityMps, maxHorizonMs, maxHumanSpeedMps].every(nonnegative)
      || maxVelocityMps === 0
      || maxHorizonMs === 0
      || robotRadiusMeters === 0
      || minClearanceMeters === 0
      || maxHumanSpeedMps === 0
    ) {
      return err({ code: "SIMULATOR_MISCONFIGURED", message: "Scene-aware navigation bounds are invalid", retryable: false });
    }

    const artifact = await this.options.artifactStore.get(worldSnapshot.digest);
    if (!artifact.ok) {
      return err({ code: "SIMULATION_FAILED", message: `World snapshot artifact unavailable: ${artifact.error.code}`, retryable: true });
    }
    if (
      artifact.value.mediaType !== "application/vnd.sint.ros2-world-snapshot+json;version=1"
      || hashSha256(artifact.value.content) !== worldSnapshot.digest
    ) {
      return err({ code: "SIMULATION_FAILED", message: "World snapshot artifact failed integrity or type validation", retryable: false });
    }

    let rawScene: unknown;
    try {
      rawScene = JSON.parse(artifact.value.content);
    } catch {
      return err({ code: "SIMULATION_FAILED", message: "World snapshot artifact is not valid JSON", retryable: false });
    }
    const scene = readScene(rawScene, worldSnapshot, 1_000);
    if (!scene.ok) return ok(indeterminate(scene.error));
    if (effectPlan.params.robotId !== scene.value.robotId || effectPlan.params.frameId !== scene.value.frameId) {
      return ok(indeterminate("Navigation robotId and frameId must match the captured scene"));
    }

    const target = point(effectPlan.params.target);
    const velocity = effectPlan.params.velocityMps;
    if (!target || typeof velocity !== "number" || !Number.isFinite(velocity) || velocity <= 0) {
      return ok(indeterminate("Navigation requires a finite target and positive velocityMps"));
    }
    const distance = Math.hypot(target.x - scene.value.start.x, target.y - scene.value.start.y);
    const durationSeconds = distance / velocity;
    if (distance === 0 || target.z !== scene.value.start.z || !Number.isFinite(durationSeconds)) {
      return ok(indeterminate("Navigation requires a nonzero planar segment in the scene frame"));
    }
    const checks: DeterministicCheckRecord[] = [
      { check: "max-velocity", status: velocity <= maxVelocityMps ? "pass" : "fail", observed: velocity, expected: `velocityMps <= ${maxVelocityMps}` },
      { check: "segment-horizon", status: durationSeconds * 1_000 <= maxHorizonMs ? "pass" : "unknown", observed: durationSeconds * 1_000, expected: `durationMs <= ${maxHorizonMs}` },
      { check: "safety-controller", status: scene.value.controllerPermitsMotion ? "pass" : "fail", expected: "controller permit granted and all protective stops clear" },
    ];
    if (checks[1]!.status === "unknown") return ok(indeterminate("Navigation segment exceeds the configured scene-check horizon"));

    let minimum = Infinity;
    let collisions = 0;
    for (const obstacle of scene.value.obstacles) {
      if (obstacle.kind === "human" && Math.hypot(obstacle.velocity.x, obstacle.velocity.y) > maxHumanSpeedMps) {
        return ok(indeterminate("Observed human speed exceeds the configured reachability bound"));
      }
      const clearance = closestClearance(
        scene.value.start, target, durationSeconds, obstacle,
        robotRadiusMeters,
        scene.value.robotPositionUncertaintyMeters + maxVelocityMps * scene.value.odometryAgeSeconds,
        maxHumanSpeedMps,
      );
      minimum = Math.min(minimum, clearance);
      if (clearance < 0) collisions++;
      checks.push({
        check: `clearance:${obstacle.id}`,
        status: clearance >= minClearanceMeters ? "pass" : "fail",
        observed: clearance,
        expected: `conservative clearance >= ${minClearanceMeters} m`,
      });
    }
    const outcome: SimulationSafetyResult["outcome"] = checks.some((check) => check.status === "fail") ? "fail" : "pass";
    return ok({
      checks,
      result: {
        outcome,
        collisions,
        safetyZoneViolations: scene.value.controllerPermitsMotion ? 0 : 1,
        maxVelocityMps: velocity,
        ...(Number.isFinite(minimum) && { minClearanceMeters: Math.max(0, minimum) }),
        assumptions: [
          "The robot follows a straight planar segment at constant commanded speed",
          "Human reachability is conservatively expanded over the full segment duration",
        ],
        unsupportedPhenomena: ["actuator lag and control-loop dynamics", "contact and material deformation"],
      },
    });
  }
}
