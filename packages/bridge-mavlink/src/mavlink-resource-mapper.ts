/**
 * MAVLink → SINT resource URI and tier mapping.
 *
 * Maps MAVLink message types and commands to SINT resource URIs and extracts
 * physical context (velocity, altitude limits) from message payloads.
 *
 * URI scheme: `mavlink://<target_system>/<message_or_command>`
 * Examples:
 *   mavlink://1/cmd_vel         — SET_POSITION_TARGET_LOCAL_NED velocity control
 *   mavlink://1/cmd/arm         — COMPONENT_ARM_DISARM
 *   mavlink://1/cmd/mission     — MISSION_START
 *   mavlink://1/cmd/mode        — SET_MODE
 *   mavlink://1/cmd/fence       — DO_FENCE_ENABLE
 *   mavlink://1/cmd/nav         — navigation waypoint
 *
 * @module @sint/bridge-mavlink/mavlink-resource-mapper
 */

import { ApprovalTier } from "@pshkv/core";
import type { SintRequest } from "@pshkv/core";
import { MAV_CMD } from "./mavlink-types.js";
import type {
  MavlinkIntercept,
  MavCommandLong,
  MavCommandInt,
  MavSetPositionTargetLocalNed,
} from "./mavlink-types.js";

// ─── Tier mapping ─────────────────────────────────────────────────────────────

/** SINT approval tier for each MAV_CMD. */
const COMMAND_TIERS: Partial<Record<number, ApprovalTier>> = {
  // ARM/DISARM — COMMIT (irreversible arming change)
  [MAV_CMD.MAV_CMD_COMPONENT_ARM_DISARM]: ApprovalTier.T3_COMMIT,

  // Mission start — COMMIT (begins autonomous operation)
  [MAV_CMD.MAV_CMD_MISSION_START]: ApprovalTier.T3_COMMIT,

  // Mode change — COMMIT (manual ↔ auto ↔ offboard transitions)
  [MAV_CMD.MAV_CMD_DO_SET_MODE]: ApprovalTier.T3_COMMIT,

  // Fence disable — COMMIT (removing a safety layer)
  [MAV_CMD.MAV_CMD_DO_FENCE_ENABLE]: ApprovalTier.T3_COMMIT,

  // Navigation commands — ACT (physical state change with position target)
  [MAV_CMD.MAV_CMD_NAV_TAKEOFF]: ApprovalTier.T2_ACT,
  [MAV_CMD.MAV_CMD_NAV_LAND]: ApprovalTier.T2_ACT,
  [MAV_CMD.MAV_CMD_NAV_WAYPOINT]: ApprovalTier.T2_ACT,
  [MAV_CMD.MAV_CMD_NAV_RETURN_TO_LAUNCH]: ApprovalTier.T2_ACT,
  [MAV_CMD.MAV_CMD_NAV_LOITER_UNLIM]: ApprovalTier.T2_ACT,
  [MAV_CMD.MAV_CMD_NAV_LOITER_TURNS]: ApprovalTier.T2_ACT,
  [MAV_CMD.MAV_CMD_NAV_LOITER_TIME]: ApprovalTier.T2_ACT,
  [MAV_CMD.MAV_CMD_NAV_LOITER_TO_ALT]: ApprovalTier.T2_ACT,
  [MAV_CMD.MAV_CMD_NAV_VTOL_TAKEOFF]: ApprovalTier.T2_ACT,
  [MAV_CMD.MAV_CMD_NAV_VTOL_LAND]: ApprovalTier.T2_ACT,

  // Speed change — ACT (modifies ongoing physical behavior)
  [MAV_CMD.MAV_CMD_DO_CHANGE_SPEED]: ApprovalTier.T2_ACT,

  // Gimbal control — ACT (physical actuator)
  [MAV_CMD.MAV_CMD_DO_MOUNT_CONTROL]: ApprovalTier.T2_ACT,

  // Condition/DO prep — PREPARE
  [MAV_CMD.MAV_CMD_CONDITION_DELAY]: ApprovalTier.T1_PREPARE,
  [MAV_CMD.MAV_CMD_CONDITION_DISTANCE]: ApprovalTier.T1_PREPARE,
  [MAV_CMD.MAV_CMD_CONDITION_YAW]: ApprovalTier.T1_PREPARE,
  [MAV_CMD.MAV_CMD_DO_JUMP]: ApprovalTier.T1_PREPARE,
  [MAV_CMD.MAV_CMD_DO_SET_HOME]: ApprovalTier.T1_PREPARE,
  [MAV_CMD.MAV_CMD_DO_MOUNT_CONFIGURE]: ApprovalTier.T1_PREPARE,

  // Camera/imaging — OBSERVE
  [MAV_CMD.MAV_CMD_IMAGE_START_CAPTURE]: ApprovalTier.T0_OBSERVE,
  [MAV_CMD.MAV_CMD_IMAGE_STOP_CAPTURE]: ApprovalTier.T0_OBSERVE,
  [MAV_CMD.MAV_CMD_VIDEO_START_CAPTURE]: ApprovalTier.T0_OBSERVE,
  [MAV_CMD.MAV_CMD_VIDEO_STOP_CAPTURE]: ApprovalTier.T0_OBSERVE,
  [MAV_CMD.MAV_CMD_DO_SET_CAM_TRIGG_DIST]: ApprovalTier.T0_OBSERVE,
};

// ─── Resource URI mapping ─────────────────────────────────────────────────────

function commandToPath(cmd: number): string {
  switch (cmd) {
    case MAV_CMD.MAV_CMD_COMPONENT_ARM_DISARM: return "cmd/arm";
    case MAV_CMD.MAV_CMD_MISSION_START: return "cmd/mission";
    case MAV_CMD.MAV_CMD_DO_SET_MODE: return "cmd/mode";
    case MAV_CMD.MAV_CMD_DO_FENCE_ENABLE: return "cmd/fence";
    case MAV_CMD.MAV_CMD_NAV_TAKEOFF:
    case MAV_CMD.MAV_CMD_NAV_VTOL_TAKEOFF: return "cmd/takeoff";
    case MAV_CMD.MAV_CMD_NAV_LAND:
    case MAV_CMD.MAV_CMD_NAV_VTOL_LAND: return "cmd/land";
    case MAV_CMD.MAV_CMD_NAV_RETURN_TO_LAUNCH: return "cmd/rtl";
    case MAV_CMD.MAV_CMD_NAV_WAYPOINT:
    case MAV_CMD.MAV_CMD_NAV_LOITER_UNLIM:
    case MAV_CMD.MAV_CMD_NAV_LOITER_TURNS:
    case MAV_CMD.MAV_CMD_NAV_LOITER_TIME:
    case MAV_CMD.MAV_CMD_NAV_LOITER_TO_ALT: return "cmd/nav";
    case MAV_CMD.MAV_CMD_DO_CHANGE_SPEED: return "cmd/speed";
    case MAV_CMD.MAV_CMD_DO_MOUNT_CONTROL: return "cmd/gimbal";
    case MAV_CMD.MAV_CMD_IMAGE_START_CAPTURE:
    case MAV_CMD.MAV_CMD_IMAGE_STOP_CAPTURE:
    case MAV_CMD.MAV_CMD_VIDEO_START_CAPTURE:
    case MAV_CMD.MAV_CMD_VIDEO_STOP_CAPTURE:
    case MAV_CMD.MAV_CMD_DO_SET_CAM_TRIGG_DIST: return "cmd/camera";
    default: return `cmd/${cmd}`;
  }
}

// ─── Physical context extraction ──────────────────────────────────────────────

/**
 * Extract physical context (velocity, altitude) from MAVLink message payloads.
 * Used to populate SintRequest.physicalContext for constraint checking.
 */
export function extractMavPhysicalContext(intercept: MavlinkIntercept): {
  currentVelocityMps?: number;
  altitudeLimitM?: number;
} {
  if (intercept.messageType === "SET_POSITION_TARGET_LOCAL_NED") {
    const msg = intercept.payload as MavSetPositionTargetLocalNed;
    // Compute 3D velocity magnitude from NED components
    const speed = Math.sqrt(msg.vx ** 2 + msg.vy ** 2 + msg.vz ** 2);
    return { currentVelocityMps: speed > 0 ? speed : undefined };
  }

  if (intercept.messageType === "COMMAND_LONG" || intercept.messageType === "COMMAND_INT") {
    const msg = intercept.payload as MavCommandLong | MavCommandInt;
    if (msg.command === MAV_CMD.MAV_CMD_DO_CHANGE_SPEED) {
      // param2 = speed (m/s), param1 = speed type (0=airspeed, 1=groundspeed, 2=climb/descent)
      return { currentVelocityMps: msg.param2 > 0 ? msg.param2 : undefined };
    }
    if (msg.command === MAV_CMD.MAV_CMD_NAV_WAYPOINT) {
      // COMMAND_LONG: param7 = altitude; COMMAND_INT: z = altitude
      const alt = "param7" in msg ? msg.param7 : (msg as MavCommandInt).z;
      return { altitudeLimitM: alt > 0 ? alt : undefined };
    }
    if (msg.command === MAV_CMD.MAV_CMD_NAV_TAKEOFF || msg.command === MAV_CMD.MAV_CMD_NAV_VTOL_TAKEOFF) {
      const alt = "param7" in msg ? msg.param7 : (msg as MavCommandInt).z;
      return { altitudeLimitM: alt > 0 ? alt : undefined };
    }
  }

  return {};
}

// ─── Main mapper ──────────────────────────────────────────────────────────────

export interface MavlinkMappedRequest {
  readonly resource: string;
  readonly action: string;
  readonly baseTier: ApprovalTier;
  readonly physicalContext?: SintRequest["physicalContext"];
}

/**
 * Map a MAVLink intercept to a SINT request specification.
 *
 * @param intercept - The intercepted MAVLink message
 * @param humanPresent - Whether a human operator is in the vicinity (BVLOS = false)
 */
export function mapMavlinkToSint(
  intercept: MavlinkIntercept,
  humanPresent = false,
): MavlinkMappedRequest {
  const sysId = intercept.systemId;
  const physical = extractMavPhysicalContext(intercept);

  // SET_POSITION_TARGET_LOCAL_NED → velocity control
  if (intercept.messageType === "SET_POSITION_TARGET_LOCAL_NED") {
    return {
      resource: `mavlink://${sysId}/cmd_vel`,
      action: "publish",
      baseTier: ApprovalTier.T2_ACT,
      physicalContext: {
        humanDetected: humanPresent,
        currentVelocityMps: physical.currentVelocityMps,
      },
    };
  }

  // SET_ATTITUDE_TARGET → attitude control (always T2_ACT — direct attitude override)
  if (intercept.messageType === "SET_ATTITUDE_TARGET") {
    return {
      resource: `mavlink://${sysId}/cmd_att`,
      action: "publish",
      baseTier: ApprovalTier.T2_ACT,
      physicalContext: { humanDetected: humanPresent },
    };
  }

  // COMMAND_LONG / COMMAND_INT
  const msg = intercept.payload as MavCommandLong | MavCommandInt;
  const cmd = msg.command;
  const path = commandToPath(cmd);
  const tier = COMMAND_TIERS[cmd] ?? ApprovalTier.T2_ACT; // Unknown → ACT (conservative)

  return {
    resource: `mavlink://${sysId}/${path}`,
    action: "call",
    baseTier: tier,
    physicalContext: {
      humanDetected: humanPresent,
      currentVelocityMps: physical.currentVelocityMps,
    },
  };
}
