/**
 * SINT Bridge-ROS2 — Message Types.
 *
 * TypeScript representations of common ROS 2 message types
 * with Zod schemas for runtime validation.
 *
 * These are protocol-compatible with standard ROS 2 message definitions
 * (geometry_msgs, sensor_msgs, etc.) but don't require rclnodejs.
 *
 * @module @sint/bridge-ros2/ros2-message-types
 */

import { z } from "zod";

// ── geometry_msgs ──

export const vector3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});
export type Vector3 = z.infer<typeof vector3Schema>;

export const twistSchema = z.object({
  linear: vector3Schema,
  angular: vector3Schema,
});
export type Twist = z.infer<typeof twistSchema>;

export const poseSchema = z.object({
  position: vector3Schema,
  orientation: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
    w: z.number(),
  }),
});
export type Pose = z.infer<typeof poseSchema>;

export const wrenchSchema = z.object({
  force: vector3Schema,
  torque: vector3Schema,
});
export type Wrench = z.infer<typeof wrenchSchema>;

// ── sensor_msgs ──

export const jointStateSchema = z.object({
  name: z.array(z.string()),
  position: z.array(z.number()),
  velocity: z.array(z.number()),
  effort: z.array(z.number()),
});
export type JointState = z.infer<typeof jointStateSchema>;

// ── nav_msgs ──

export const odometrySchema = z.object({
  pose: poseSchema,
  twist: twistSchema,
});
export type Odometry = z.infer<typeof odometrySchema>;

/**
 * Extract physical context from a Twist message.
 * Computes velocity magnitude and force estimate.
 */
export function extractPhysicalContextFromTwist(
  twist: Twist,
  robotMassKg?: number,
): {
  velocityMps: number;
  forceNewtons?: number;
} {
  const vx = twist.linear.x;
  const vy = twist.linear.y;
  const vz = twist.linear.z;
  const velocityMps = Math.sqrt(vx * vx + vy * vy + vz * vz);

  return {
    velocityMps,
    forceNewtons: robotMassKg !== undefined ? velocityMps * robotMassKg : undefined,
  };
}

/**
 * Extract physical context from a Wrench message.
 */
export function extractPhysicalContextFromWrench(wrench: Wrench): {
  forceNewtons: number;
} {
  const fx = wrench.force.x;
  const fy = wrench.force.y;
  const fz = wrench.force.z;
  return {
    forceNewtons: Math.sqrt(fx * fx + fy * fy + fz * fz),
  };
}
