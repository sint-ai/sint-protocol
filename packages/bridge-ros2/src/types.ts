/**
 * SINT Bridge-ROS2 — Types for ROS 2 interception.
 *
 * @module @sint/bridge-ros2/types
 */

import type {
  ApprovalTier,
  ISO8601,
  PolicyDecision,
} from "@pshkv/core";
import type { QoSProfile } from "./ros2-qos.js";

/**
 * A ROS 2 topic message entering the SINT bridge.
 */
export interface ROS2TopicMessage {
  /** Topic name (e.g. "/cmd_vel", "/camera/front"). */
  readonly topicName: string;
  /** Message type (e.g. "geometry_msgs/Twist"). */
  readonly messageType: string;
  /** The message payload. */
  readonly data: Record<string, unknown>;
  /** QoS profile used. */
  readonly qos?: QoSProfile;
  /** Timestamp. */
  readonly timestamp: ISO8601;
}

/**
 * A ROS 2 service call entering the SINT bridge.
 */
export interface ROS2ServiceCall {
  /** Service name (e.g. "/set_mode"). */
  readonly serviceName: string;
  /** Service type (e.g. "std_srvs/SetBool"). */
  readonly serviceType: string;
  /** Request payload. */
  readonly request: Record<string, unknown>;
  /** Timestamp. */
  readonly timestamp: ISO8601;
}

/**
 * A ROS 2 action goal entering the SINT bridge.
 */
export interface ROS2ActionGoal {
  /** Action name (e.g. "/navigate_to_pose"). */
  readonly actionName: string;
  /** Action type (e.g. "nav2_msgs/NavigateToPose"). */
  readonly actionType: string;
  /** Goal payload. */
  readonly goal: Record<string, unknown>;
  /** Timestamp. */
  readonly timestamp: ISO8601;
}

/**
 * Result of SINT intercepting a ROS 2 operation.
 */
export interface ROS2InterceptResult {
  /** What action SINT decided. */
  readonly action: "forward" | "deny" | "escalate";
  /** The full policy decision. */
  readonly decision: PolicyDecision;
  /** The original topic/service/action name. */
  readonly resourceName: string;
  /** If denied, the reason. */
  readonly denyReason?: string;
  /** If escalated, which tier is required. */
  readonly requiredTier?: ApprovalTier;
}
