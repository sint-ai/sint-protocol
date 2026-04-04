/**
 * Navigation Capsule — Waypoint following.
 *
 * This is a T2_ACT capsule: it reads GPS/IMU and commands
 * velocity to follow waypoints. Physical state change — requires
 * PolicyGateway approval for cmd_vel publishes.
 *
 * @module capsule/navigation
 *
 * @example
 * ```ts
 * const waypoints = [{ x: 1, y: 0, tolerance: 0.2 }, { x: 2, y: 1, tolerance: 0.2 }];
 * const result = await execute(api, waypoints);
 * ```
 */

import type {
  NavigationConfig,
  NavigationResult,
  VelocityCommand,
  Waypoint,
} from "./types.js";

export type { NavigationConfig, NavigationResult, VelocityCommand, Waypoint };
export { DEFAULT_NAVIGATION_CONFIG } from "./types.js";

/**
 * CapsuleApi interface provided by sandbox at runtime.
 */
interface CapsuleApi {
  readSensor(sensorId: string): Promise<{ data: unknown; confidence: number } | null>;
  requestAction(action: string, resource: string, params: Record<string, unknown>): Promise<{ allowed: boolean; reason?: string }>;
  log(level: "info" | "warn" | "error", message: string): void;
}

/**
 * Compute distance between two 2D points.
 *
 * @example
 * ```ts
 * const d = distance2D(0, 0, 3, 4); // 5
 * ```
 */
export function distance2D(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
}

/**
 * Compute velocity command to navigate toward a waypoint.
 * Uses proportional control with speed limits.
 *
 * @example
 * ```ts
 * const cmd = computeVelocity(0, 0, 0, { x: 1, y: 0, tolerance: 0.1 });
 * ```
 */
export function computeVelocity(
  currentX: number,
  currentY: number,
  currentYaw: number,
  waypoint: Waypoint,
  config: NavigationConfig = { maxLinearSpeed: 1.0, maxAngularSpeed: 0.5, steeringGain: 1.0 },
): VelocityCommand {
  const dx = waypoint.x - currentX;
  const dy = waypoint.y - currentY;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < waypoint.tolerance) {
    return { linearX: 0, angularZ: 0 };
  }

  const targetAngle = Math.atan2(dy, dx);
  let angleError = targetAngle - currentYaw;

  // Normalize to [-PI, PI]
  while (angleError > Math.PI) angleError -= 2 * Math.PI;
  while (angleError < -Math.PI) angleError += 2 * Math.PI;

  const linearX = Math.min(config.maxLinearSpeed, dist * 0.5);
  const angularZ = Math.max(
    -config.maxAngularSpeed,
    Math.min(config.maxAngularSpeed, angleError * config.steeringGain),
  );

  return { linearX, angularZ };
}

/**
 * Main capsule execution entry point.
 * Navigates toward the next waypoint in the list.
 *
 * @example
 * ```ts
 * const result = await execute(api, [{ x: 1, y: 0, tolerance: 0.2 }], 0);
 * ```
 */
export async function execute(
  api: CapsuleApi,
  waypoints: readonly Waypoint[],
  currentWaypointIndex: number = 0,
  config: NavigationConfig = { maxLinearSpeed: 1.0, maxAngularSpeed: 0.5, steeringGain: 1.0 },
): Promise<NavigationResult> {
  api.log("info", `Navigation cycle: waypoint ${currentWaypointIndex + 1}/${waypoints.length}`);

  if (currentWaypointIndex >= waypoints.length) {
    api.log("info", "All waypoints reached");
    return {
      status: "arrived",
      currentWaypointIndex,
      distanceToWaypoint: 0,
      velocityCommand: null,
    };
  }

  const gpsReading = await api.readSensor("gps");
  if (!gpsReading) {
    api.log("error", "No GPS data available");
    return {
      status: "error",
      currentWaypointIndex,
      distanceToWaypoint: Infinity,
      velocityCommand: null,
    };
  }

  const imuReading = await api.readSensor("imu");
  const position = gpsReading.data as { x: number; y: number };
  const yaw = imuReading ? (imuReading.data as { yaw: number }).yaw : 0;

  const waypoint = waypoints[currentWaypointIndex]!;
  const dist = distance2D(position.x, position.y, waypoint.x, waypoint.y);

  if (dist < waypoint.tolerance) {
    api.log("info", `Arrived at waypoint ${currentWaypointIndex + 1}`);
    return {
      status: currentWaypointIndex >= waypoints.length - 1 ? "arrived" : "navigating",
      currentWaypointIndex: currentWaypointIndex + 1,
      distanceToWaypoint: 0,
      velocityCommand: { linearX: 0, angularZ: 0 },
    };
  }

  const velocityCommand = computeVelocity(position.x, position.y, yaw, waypoint, config);

  // Request action through PolicyGateway
  const result = await api.requestAction("publish", "ros2:///cmd_vel", {
    linearX: velocityCommand.linearX,
    angularZ: velocityCommand.angularZ,
  });

  if (!result.allowed) {
    api.log("warn", `cmd_vel denied: ${result.reason ?? "unknown"}`);
    return {
      status: "blocked",
      currentWaypointIndex,
      distanceToWaypoint: dist,
      velocityCommand: null,
    };
  }

  return {
    status: "navigating",
    currentWaypointIndex,
    distanceToWaypoint: dist,
    velocityCommand,
  };
}
