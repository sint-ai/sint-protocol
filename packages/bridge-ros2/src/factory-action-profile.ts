/**
 * SINT Bridge-ROS2 — Factory Action Profile mapping.
 *
 * Converts the vendor-neutral RobotActionProfile into a ROS 2 command envelope
 * that can still flow through the normal PolicyGateway interception path.
 *
 * @module @sint/bridge-ros2/factory-action-profile
 */

import { z } from "zod";
import type { ISO8601 } from "@pshkv/core";
import type { ROS2TopicMessage } from "./types.js";

export const robotActionProfileSchema = z.object({
  action_type: z.string().regex(/^robot\.[a-z0-9_]+\.[a-z0-9_]+$/),
  target_robot: z.string().min(1),
  motion: z.object({
    source_pose: z.string().min(1),
    target_pose: z.string().min(1),
    max_velocity_mps: z.number().positive(),
    max_force_newtons: z.number().positive(),
    collision_check: z.boolean(),
  }),
  tool: z.object({
    type: z.string().min(1),
    payload_kg: z.number().nonnegative(),
  }),
  requires: z.object({
    simulation_receipt: z.boolean(),
    human_approval: z.boolean(),
    safety_zone_clear: z.boolean(),
  }),
  adapter_hint: z.string().optional(),
});

export type RobotActionProfile = z.infer<typeof robotActionProfileSchema>;

export const factoryRobotActionRos2DataSchema = z.object({
  action_type: z.string(),
  target_robot: z.string(),
  source_pose: z.string(),
  target_pose: z.string(),
  max_velocity_mps: z.number().positive(),
  max_force_newtons: z.number().positive(),
  collision_check: z.boolean(),
  tool_type: z.string(),
  payload_kg: z.number().nonnegative(),
  requires_simulation_receipt: z.boolean(),
  requires_human_approval: z.boolean(),
  requires_safety_zone_clear: z.boolean(),
  adapter_hint: z.string().optional(),
  cell_id: z.string().optional(),
  simulation_receipt_id: z.string().optional(),
  approval_id: z.string().optional(),
});

export type FactoryRobotActionRos2Data = z.infer<
  typeof factoryRobotActionRos2DataSchema
>;

export interface FactoryRobotActionRos2Options {
  readonly topicName?: string;
  readonly timestamp?: ISO8601;
  readonly cellId?: string;
  readonly simulationReceiptId?: string;
  readonly approvalId?: string;
}

export const FACTORY_ROBOT_ACTION_TOPIC = "/joint_commands";
export const FACTORY_ROBOT_ACTION_MESSAGE_TYPE = "sint_msgs/msg/FactoryRobotAction";

export function factoryRobotActionToRos2TopicName(
  options: FactoryRobotActionRos2Options = {},
): string {
  return options.topicName ?? FACTORY_ROBOT_ACTION_TOPIC;
}

export function factoryRobotActionToRos2ResourceUri(
  options: FactoryRobotActionRos2Options = {},
): string {
  const topicName = factoryRobotActionToRos2TopicName(options);
  const normalized = topicName.startsWith("/") ? topicName.slice(1) : topicName;
  return `ros2:///${normalized}`;
}

export function robotActionProfileToRos2Data(
  action: RobotActionProfile,
  options: FactoryRobotActionRos2Options = {},
): FactoryRobotActionRos2Data {
  return {
    action_type: action.action_type,
    target_robot: action.target_robot,
    source_pose: action.motion.source_pose,
    target_pose: action.motion.target_pose,
    max_velocity_mps: action.motion.max_velocity_mps,
    max_force_newtons: action.motion.max_force_newtons,
    collision_check: action.motion.collision_check,
    tool_type: action.tool.type,
    payload_kg: action.tool.payload_kg,
    requires_simulation_receipt: action.requires.simulation_receipt,
    requires_human_approval: action.requires.human_approval,
    requires_safety_zone_clear: action.requires.safety_zone_clear,
    adapter_hint: action.adapter_hint,
    cell_id: options.cellId,
    simulation_receipt_id: options.simulationReceiptId,
    approval_id: options.approvalId,
  };
}

export function robotActionProfileToRos2TopicMessage(
  action: RobotActionProfile,
  options: FactoryRobotActionRos2Options = {},
): ROS2TopicMessage {
  return {
    topicName: factoryRobotActionToRos2TopicName(options),
    messageType: FACTORY_ROBOT_ACTION_MESSAGE_TYPE,
    data: robotActionProfileToRos2Data(action, options),
    timestamp: options.timestamp ?? new Date().toISOString(),
  };
}

export function extractPhysicalContextFromFactoryRobotAction(
  data: Record<string, unknown>,
): {
  currentVelocityMps: number;
  currentForceNewtons: number;
} | undefined {
  const result = factoryRobotActionRos2DataSchema.safeParse(data);
  if (!result.success) {
    return undefined;
  }

  return {
    currentVelocityMps: result.data.max_velocity_mps,
    currentForceNewtons: result.data.max_force_newtons,
  };
}
