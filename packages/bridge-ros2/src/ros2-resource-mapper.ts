/**
 * SINT Bridge-ROS2 — Resource Mapper.
 *
 * Maps ROS 2 topic/service/action names to SINT resource URIs.
 * Extracts physical context from message payloads.
 *
 * URI scheme: ros2:///{topicName} (triple-slash for absolute topic names)
 *
 * @module @sint/bridge-ros2/ros2-resource-mapper
 */

import type { ROS2TopicMessage } from "./types.js";
import {
  twistSchema,
  wrenchSchema,
  extractPhysicalContextFromTwist,
  extractPhysicalContextFromWrench,
} from "./ros2-message-types.js";

export interface TopicToResourceOptions {
  /**
   * Normalize common Gazebo-scoped control topics (e.g. `/model/amr/cmd_vel`)
   * into canonical ROS2 control resources (e.g. `/cmd_vel`) so simulation and
   * physical paths share equivalent policy tiering.
   */
  gazeboNormalize?: boolean;
  /**
   * Normalize common Isaac Sim namespaced ROS2 control topics
   * (e.g. `/isaac/ur10/cmd_vel`) into canonical control resources.
   */
  isaacNormalize?: boolean;
}

const GAZEBO_CONTROL_TOPIC_SUFFIX =
  /\/(cmd_vel|joint_commands|mode_change|plan|waypoints|navigate_to_pose)$/;
const ISAAC_NAMESPACED_CONTROL_TOPIC =
  /^\/(isaac|sim|robots)\/[^/]+\/(cmd_vel|joint_commands|mode_change|plan|waypoints|navigate_to_pose)$/;

function normalizeTopicName(topicName: string, options?: TopicToResourceOptions): string {
  const normalized = topicName.startsWith("/") ? topicName : `/${topicName}`;
  if (!options?.gazeboNormalize) {
    return normalized;
  }

  const gazeboScoped =
    normalized.startsWith("/model/") ||
    normalized.startsWith("/world/");
  if (!gazeboScoped) {
    return normalized;
  }

  const suffix = normalized.match(GAZEBO_CONTROL_TOPIC_SUFFIX)?.[1];
  if (!suffix) {
    return normalized;
  }
  return `/${suffix}`;
}

function normalizeIsaacTopicName(topicName: string, options?: TopicToResourceOptions): string {
  const normalized = topicName.startsWith("/") ? topicName : `/${topicName}`;
  if (!options?.isaacNormalize) {
    return normalized;
  }
  const match = normalized.match(ISAAC_NAMESPACED_CONTROL_TOPIC);
  if (!match?.[2]) {
    return normalized;
  }
  return `/${match[2]}`;
}

/**
 * Map a ROS 2 topic name to a SINT resource URI.
 *
 * @example
 * ```ts
 * topicToResourceUri("/cmd_vel") // => "ros2:///cmd_vel"
 * topicToResourceUri("/camera/front") // => "ros2:///camera/front"
 * ```
 */
export function topicToResourceUri(
  topicName: string,
  options?: TopicToResourceOptions,
): string {
  const normalized = normalizeIsaacTopicName(
    normalizeTopicName(topicName, options),
    options,
  );
  return `ros2:///${normalized.slice(1)}`;
}

/**
 * Map a Gazebo-scoped ROS2 topic to a canonical SINT resource URI.
 *
 * @example
 * ```ts
 * gazeboTopicToResourceUri("/model/amr_17/cmd_vel") // => "ros2:///cmd_vel"
 * gazeboTopicToResourceUri("/world/demo/model/amr_17/joint_commands") // => "ros2:///joint_commands"
 * ```
 */
export function gazeboTopicToResourceUri(topicName: string): string {
  return topicToResourceUri(topicName, { gazeboNormalize: true });
}

/**
 * Map an Isaac Sim namespaced ROS2 topic to a canonical SINT resource URI.
 *
 * @example
 * ```ts
 * isaacTopicToResourceUri("/isaac/ur10/cmd_vel") // => "ros2:///cmd_vel"
 * isaacTopicToResourceUri("/robots/cell_bot_01/joint_commands") // => "ros2:///joint_commands"
 * ```
 */
export function isaacTopicToResourceUri(topicName: string): string {
  return topicToResourceUri(topicName, { isaacNormalize: true });
}

/**
 * Map a ROS 2 service name to a SINT resource URI.
 */
export function serviceToResourceUri(serviceName: string): string {
  const normalized = serviceName.startsWith("/") ? serviceName.slice(1) : serviceName;
  return `ros2:///${normalized}`;
}

/**
 * Map a ROS 2 action name to a SINT resource URI.
 */
export function actionToResourceUri(actionName: string): string {
  const normalized = actionName.startsWith("/") ? actionName.slice(1) : actionName;
  return `ros2:///${normalized}`;
}

/**
 * Determine the SINT action for a topic operation.
 */
export function topicAction(operation: "publish" | "subscribe"): string {
  return operation;
}

/**
 * Determine the SINT action for a service call.
 */
export function serviceAction(): string {
  return "call";
}

/**
 * Extract physical context from a ROS 2 topic message payload.
 *
 * Recognizes Twist (velocity commands) and Wrench (force commands)
 * messages and extracts the relevant physical parameters.
 */
export function extractPhysicalContext(
  message: ROS2TopicMessage,
  robotMassKg?: number,
): {
  currentVelocityMps?: number;
  currentForceNewtons?: number;
} | undefined {
  // Try to parse as Twist (cmd_vel)
  const twistResult = twistSchema.safeParse(message.data);
  if (twistResult.success) {
    const ctx = extractPhysicalContextFromTwist(twistResult.data, robotMassKg);
    return {
      currentVelocityMps: ctx.velocityMps,
      currentForceNewtons: ctx.forceNewtons,
    };
  }

  // Try to parse as Wrench
  const wrenchResult = wrenchSchema.safeParse(message.data);
  if (wrenchResult.success) {
    const ctx = extractPhysicalContextFromWrench(wrenchResult.data);
    return {
      currentForceNewtons: ctx.forceNewtons,
    };
  }

  return undefined;
}
