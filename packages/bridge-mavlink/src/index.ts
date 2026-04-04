/**
 * @sint/bridge-mavlink — SINT Protocol MAVLink bridge
 *
 * Intercepts MAVLink v2 commands before reaching the autopilot (ArduPilot, PX4).
 * Enforces capability token constraints, tier-based approval gates, and physical
 * constraints (velocity limits, geofence, altitude limits) on drone operations.
 *
 * Covers the MAVLink → SINT security gap identified in arXiv:2603.26997 (ROSClaw)
 * for aerial robotics: unprotected ARM, MISSION_START, and velocity commands.
 *
 * @example
 * ```ts
 * import { MAVLinkInterceptor, MAV_CMD, mapMavlinkToSint } from "@sint/bridge-mavlink";
 *
 * const interceptor = new MAVLinkInterceptor({
 *   gateway, agentId, tokenId, humanPresent: false,
 * });
 *
 * const result = await interceptor.intercept({
 *   messageType: "COMMAND_LONG",
 *   command: MAV_CMD.MAV_CMD_COMPONENT_ARM_DISARM,
 *   payload: { param1: 1 },  // 1 = arm
 *   timestamp: new Date().toISOString(),
 *   systemId: 1,
 *   componentId: 1,
 * });
 * ```
 */

export { MAVLinkInterceptor } from "./mavlink-interceptor.js";
export { mapMavlinkToSint, extractMavPhysicalContext } from "./mavlink-resource-mapper.js";
export { MAV_CMD } from "./mavlink-types.js";
export type {
  MavlinkIntercept,
  MavlinkInterceptResult,
  MavCommandLong,
  MavCommandInt,
  MavSetPositionTargetLocalNed,
  MavSetAttitudeTarget,
  Px4MainMode,
  ArduPilotMode,
} from "./mavlink-types.js";
