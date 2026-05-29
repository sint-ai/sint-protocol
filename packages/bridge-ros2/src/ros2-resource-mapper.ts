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
  differentialWheelCommandSchema,
  extractPhysicalContextFromTwist,
  extractPhysicalContextFromWrench,
  extractPhysicalContextFromDifferentialWheelCommand,
} from "./ros2-message-types.js";
import { extractPhysicalContextFromFactoryRobotAction } from "./factory-action-profile.js";

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
  /**
   * Normalize namespaced differential-drive topics such as
   * `/robot/cmd_wheels` and `/robot/enc_wheels` into canonical SINT
   * resources. This matches the public control surface used by the
   * Sunnybotics T800 ROS2 + micro-ROS example.
   */
  differentialDriveNormalize?: boolean;
}

const GAZEBO_CONTROL_TOPIC_SUFFIX =
  /\/(cmd_vel|joint_commands|mode_change|plan|waypoints|navigate_to_pose)$/;
const ISAAC_NAMESPACED_CONTROL_TOPIC =
  /^\/(isaac|sim|robots)\/[^/]+\/(cmd_vel|joint_commands|mode_change|plan|waypoints|navigate_to_pose)$/;
const DIFFERENTIAL_DRIVE_TOPIC_SUFFIX = /\/(cmd_wheels|enc_wheels)$/;

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

function normalizeDifferentialDriveTopicName(
  topicName: string,
  options?: TopicToResourceOptions,
): string {
  const normalized = topicName.startsWith("/") ? topicName : `/${topicName}`;
  if (!options?.differentialDriveNormalize) {
    return normalized;
  }
  const match = normalized.match(DIFFERENTIAL_DRIVE_TOPIC_SUFFIX);
  if (!match?.[1]) {
    return normalized;
  }
  return `/${match[1]}`;
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
  const normalized = normalizeDifferentialDriveTopicName(
    normalizeIsaacTopicName(
      normalizeTopicName(topicName, options),
      options,
    ),
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
 * Map a namespaced differential-drive wheel topic to a canonical SINT
 * resource URI.
 *
 * @example
 * ```ts
 * differentialDriveTopicToResourceUri("/robot/cmd_wheels") // => "ros2:///cmd_wheels"
 * differentialDriveTopicToResourceUri("/robot_12/enc_wheels") // => "ros2:///enc_wheels"
 * ```
 */
export function differentialDriveTopicToResourceUri(topicName: string): string {
  return topicToResourceUri(topicName, { differentialDriveNormalize: true });
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

export interface PhysicalContextOptions {
  readonly robotMassKg?: number;
  readonly differentialDriveWheelRadiusM?: number;
  readonly differentialDriveControlTopicPattern?: RegExp;
}

function resolvePhysicalContextOptions(
  robotMassKgOrOptions?: number | PhysicalContextOptions,
): PhysicalContextOptions {
  if (typeof robotMassKgOrOptions === "number") {
    return { robotMassKg: robotMassKgOrOptions };
  }
  return robotMassKgOrOptions ?? {};
}

function isDifferentialDriveControlTopic(
  topicName: string,
  pattern?: RegExp,
): boolean {
  const normalized = topicName.startsWith("/") ? topicName : `/${topicName}`;
  if (pattern) {
    return pattern.test(normalized);
  }
  return normalized.endsWith("/cmd_wheels") || normalized === "/cmd_wheels";
}

/**
 * Extract physical context from a ROS 2 topic message payload.
 *
 * Recognizes Twist (velocity commands) and Wrench (force commands)
 * messages and extracts the relevant physical parameters.
 */
export function extractPhysicalContext(
  message: ROS2TopicMessage,
  robotMassKgOrOptions?: number | PhysicalContextOptions,
): {
  currentVelocityMps?: number;
  currentForceNewtons?: number;
} | undefined {
  const options = resolvePhysicalContextOptions(robotMassKgOrOptions);

  // Try to parse as Twist (cmd_vel)
  const twistResult = twistSchema.safeParse(message.data);
  if (twistResult.success) {
    const ctx = extractPhysicalContextFromTwist(
      twistResult.data,
      options.robotMassKg,
    );
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

  const differentialWheelResult = differentialWheelCommandSchema.safeParse(message.data);
  if (
    differentialWheelResult.success &&
    isDifferentialDriveControlTopic(
      message.topicName,
      options.differentialDriveControlTopicPattern,
    )
  ) {
    const ctx = extractPhysicalContextFromDifferentialWheelCommand(
      differentialWheelResult.data,
      {
        wheelRadiusM: options.differentialDriveWheelRadiusM,
        robotMassKg: options.robotMassKg,
      },
    );
    if (ctx.velocityMps !== undefined || ctx.forceNewtons !== undefined) {
      return {
        currentVelocityMps: ctx.velocityMps,
        currentForceNewtons: ctx.forceNewtons,
      };
    }
  }

  const factoryActionContext = extractPhysicalContextFromFactoryRobotAction(message.data);
  if (factoryActionContext !== undefined) {
    return factoryActionContext;
  }

  return undefined;
}
