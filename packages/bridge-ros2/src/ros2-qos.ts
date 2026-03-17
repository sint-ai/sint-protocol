/**
 * SINT Bridge-ROS2 — QoS Profiles.
 *
 * Quality of Service presets for different communication patterns.
 * Maps to ROS 2 DDS QoS policies.
 *
 * @module @sint/bridge-ros2/ros2-qos
 */

export type ReliabilityPolicy = "reliable" | "best_effort";
export type DurabilityPolicy = "volatile" | "transient_local";
export type HistoryPolicy = "keep_last" | "keep_all";

export interface QoSProfile {
  readonly reliability: ReliabilityPolicy;
  readonly durability: DurabilityPolicy;
  readonly history: HistoryPolicy;
  readonly depth: number;
}

/** Reliable delivery for commands that must not be lost. */
export const QOS_COMMAND: QoSProfile = {
  reliability: "reliable",
  durability: "volatile",
  history: "keep_last",
  depth: 1,
};

/** Best-effort for high-frequency sensor data. */
export const QOS_SENSOR: QoSProfile = {
  reliability: "best_effort",
  durability: "volatile",
  history: "keep_last",
  depth: 5,
};

/** Reliable with transient local for parameters. */
export const QOS_PARAMETER: QoSProfile = {
  reliability: "reliable",
  durability: "transient_local",
  history: "keep_last",
  depth: 10,
};

/** Default profile — reliable with small queue. */
export const QOS_DEFAULT: QoSProfile = {
  reliability: "reliable",
  durability: "volatile",
  history: "keep_last",
  depth: 10,
};
