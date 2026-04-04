/**
 * Navigation Capsule — Internal types.
 *
 * @module capsule/navigation/types
 */

/** A 2D waypoint. */
export interface Waypoint {
  readonly x: number;
  readonly y: number;
  /** Tolerance in meters — how close is "arrived". */
  readonly tolerance: number;
}

/** Navigation command output. */
export interface VelocityCommand {
  /** Linear velocity in m/s. */
  readonly linearX: number;
  /** Angular velocity in rad/s. */
  readonly angularZ: number;
}

/** Navigation state machine status. */
export type NavigationStatus =
  | "idle"
  | "navigating"
  | "arrived"
  | "blocked"
  | "error";

/** Navigation result. */
export interface NavigationResult {
  readonly status: NavigationStatus;
  readonly currentWaypointIndex: number;
  readonly distanceToWaypoint: number;
  readonly velocityCommand: VelocityCommand | null;
}

/** Navigation capsule configuration. */
export interface NavigationConfig {
  /** Maximum linear speed in m/s. */
  readonly maxLinearSpeed: number;
  /** Maximum angular speed in rad/s. */
  readonly maxAngularSpeed: number;
  /** Proportional gain for steering. */
  readonly steeringGain: number;
}

export const DEFAULT_NAVIGATION_CONFIG: NavigationConfig = {
  maxLinearSpeed: 1.0,
  maxAngularSpeed: 0.5,
  steeringGain: 1.0,
};
