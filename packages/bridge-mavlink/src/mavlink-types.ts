/**
 * MAVLink message types relevant to SINT safety interception.
 *
 * Covers MAVLink v2 (MAVLINK20) protocol as used by ArduPilot, PX4, MAVSDK.
 * Only commands that have physical side effects are defined here — pure
 * telemetry (HEARTBEAT, GPS_RAW_INT, etc.) flows through without interception.
 *
 * Reference: https://mavlink.io/en/messages/common.html
 *
 * @module @sint/bridge-mavlink/mavlink-types
 */

// ─── MAV_CMD (COMMAND_LONG / COMMAND_INT) ───────────────��────────────────────

/**
 * MAVLink command identifiers.
 * Each maps to a SINT approval tier in MAVLinkResourceMapper.
 */
export const MAV_CMD = {
  // Navigation — ACT tier
  MAV_CMD_NAV_WAYPOINT: 16,
  MAV_CMD_NAV_LOITER_UNLIM: 17,
  MAV_CMD_NAV_LOITER_TURNS: 18,
  MAV_CMD_NAV_LOITER_TIME: 19,
  MAV_CMD_NAV_RETURN_TO_LAUNCH: 20,
  MAV_CMD_NAV_LAND: 21,
  MAV_CMD_NAV_TAKEOFF: 22,
  MAV_CMD_NAV_LOITER_TO_ALT: 31,
  MAV_CMD_NAV_VTOL_TAKEOFF: 84,
  MAV_CMD_NAV_VTOL_LAND: 85,

  // Condition — PREPARE tier
  MAV_CMD_CONDITION_DELAY: 112,
  MAV_CMD_CONDITION_DISTANCE: 114,
  MAV_CMD_CONDITION_YAW: 115,

  // DO — mixed tiers
  MAV_CMD_DO_SET_MODE: 176,           // COMMIT — mode changes are irreversible
  MAV_CMD_DO_JUMP: 177,               // PREPARE
  MAV_CMD_DO_CHANGE_SPEED: 178,       // ACT — velocity change
  MAV_CMD_DO_SET_HOME: 179,           // PREPARE
  MAV_CMD_DO_MOUNT_CONFIGURE: 204,    // PREPARE
  MAV_CMD_DO_MOUNT_CONTROL: 205,      // ACT — gimbal movement
  MAV_CMD_DO_SET_CAM_TRIGG_DIST: 206, // OBSERVE
  MAV_CMD_DO_FENCE_ENABLE: 207,       // COMMIT — disable fence is COMMIT

  // Component arm/disarm — COMMIT
  MAV_CMD_COMPONENT_ARM_DISARM: 400,

  // Mission commands — COMMIT
  MAV_CMD_MISSION_START: 300,         // COMMIT — begin mission execution

  // Camera/payload
  MAV_CMD_IMAGE_START_CAPTURE: 2000,  // OBSERVE
  MAV_CMD_IMAGE_STOP_CAPTURE: 2001,   // OBSERVE
  MAV_CMD_VIDEO_START_CAPTURE: 2500,  // OBSERVE
  MAV_CMD_VIDEO_STOP_CAPTURE: 2501,   // OBSERVE
} as const;

export type MavCmd = typeof MAV_CMD[keyof typeof MAV_CMD];

// ─── Flight modes ──────────────────────────────────────────���──────────────────

/** PX4 custom main modes (mapped from MAV_CMD_DO_SET_MODE params). */
export type Px4MainMode =
  | "MANUAL"
  | "ALTCTL"
  | "POSCTL"
  | "AUTO"
  | "ACRO"
  | "OFFBOARD"
  | "STABILIZED"
  | "RATTITUDE"
  | "SIMPLE";

/** ArduPilot plane modes. */
export type ArduPilotMode =
  | "MANUAL"
  | "CIRCLE"
  | "STABILIZE"
  | "TRAINING"
  | "ACRO"
  | "FLY_BY_WIRE_A"
  | "FLY_BY_WIRE_B"
  | "CRUISE"
  | "AUTOTUNE"
  | "AUTO"
  | "RTL"
  | "LOITER"
  | "TAKEOFF"
  | "AVOID_ADSB"
  | "GUIDED"
  | "INITIALISING"
  | "QSTABILIZE"
  | "QHOVER"
  | "QLOITER"
  | "QLAND"
  | "QRTL"
  | "QAUTOTUNE"
  | "QACRO";

// ─── Message types ────────────────────────────���───────────────────────────────

/** MAVLink SET_POSITION_TARGET_LOCAL_NED (msg id 84). */
export interface MavSetPositionTargetLocalNed {
  readonly type_mask: number;
  readonly coordinate_frame: number;
  readonly x: number;      // North (m)
  readonly y: number;      // East (m)
  readonly z: number;      // Down (m) — negative is up
  readonly vx: number;     // velocity N (m/s)
  readonly vy: number;     // velocity E (m/s)
  readonly vz: number;     // velocity D (m/s)
  readonly afx: number;    // acceleration N (m/s²)
  readonly afy: number;    // acceleration E (m/s²)
  readonly afz: number;    // acceleration D (m/s²)
  readonly yaw: number;    // rad
  readonly yaw_rate: number; // rad/s
}

/** MAVLink SET_ATTITUDE_TARGET (msg id 82). */
export interface MavSetAttitudeTarget {
  readonly type_mask: number;
  readonly q: readonly [number, number, number, number]; // quaternion [w, x, y, z]
  readonly body_roll_rate: number;   // rad/s
  readonly body_pitch_rate: number;  // rad/s
  readonly body_yaw_rate: number;    // rad/s
  readonly thrust: number;           // 0–1 normalized
}

/** MAVLink COMMAND_LONG (msg id 76). */
export interface MavCommandLong {
  readonly target_system: number;
  readonly target_component: number;
  readonly command: MavCmd;
  readonly confirmation: number;
  readonly param1: number;
  readonly param2: number;
  readonly param3: number;
  readonly param4: number;
  readonly param5: number;
  readonly param6: number;
  readonly param7: number;
}

/** MAVLink COMMAND_INT (msg id 75). */
export interface MavCommandInt {
  readonly target_system: number;
  readonly target_component: number;
  readonly frame: number;
  readonly command: MavCmd;
  readonly current: number;
  readonly autocontinue: number;
  readonly param1: number;
  readonly param2: number;
  readonly param3: number;
  readonly param4: number;
  readonly x: number;  // lat * 1e7
  readonly y: number;  // lon * 1e7
  readonly z: number;  // altitude (m)
}

// ─── SINT-specific ──────────────���──────────────────────────��───────────────────

/** A MAVLink command intercepted by SINT before forwarding to the autopilot. */
export interface MavlinkIntercept {
  /** MAVLink message type. */
  readonly messageType:
    | "COMMAND_LONG"
    | "COMMAND_INT"
    | "SET_POSITION_TARGET_LOCAL_NED"
    | "SET_ATTITUDE_TARGET";

  /** Parsed command ID (if COMMAND_LONG/INT). */
  readonly command?: MavCmd;

  /** Raw message payload. */
  readonly payload: MavCommandLong | MavCommandInt | MavSetPositionTargetLocalNed | MavSetAttitudeTarget;

  /** Timestamp (ISO 8601). */
  readonly timestamp: string;

  /** System ID of the source GCS or companion computer. */
  readonly systemId: number;

  /** Component ID. */
  readonly componentId: number;
}

/** Result of a MAVLink interception. */
export interface MavlinkInterceptResult {
  /** Whether the command should be forwarded to the autopilot. */
  readonly action: "forward" | "deny" | "escalate";
  /** PolicyGateway decision details. */
  readonly decision: import("@sint/core").PolicyDecision;
  /** Original intercepted message. */
  readonly original: MavlinkIntercept;
  /** Sanitized command (for "transform" decisions — e.g., velocity capped). */
  readonly sanitized?: MavlinkIntercept;
}
