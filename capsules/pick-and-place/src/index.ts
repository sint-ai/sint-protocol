/**
 * Pick-and-Place Capsule — Gripper control for object manipulation.
 *
 * This is a T2_ACT capsule: it commands gripper open/close and
 * joint positions. All actuator commands route through PolicyGateway.
 *
 * @module capsule/pick-and-place
 *
 * @example
 * ```ts
 * const result = await execute(api, "detect");
 * if (result.target) {
 *   const graspResult = await execute(api, "grasp");
 * }
 * ```
 */

import type {
  GraspTarget,
  GripState,
  PickPlaceConfig,
  PickPlacePhase,
  PickPlaceResult,
} from "./types.js";

export type {
  GraspTarget,
  GripState,
  PickPlaceConfig,
  PickPlacePhase,
  PickPlaceResult,
};
export { DEFAULT_PICK_PLACE_CONFIG } from "./types.js";

/**
 * CapsuleApi interface provided by sandbox at runtime.
 */
interface CapsuleApi {
  readSensor(sensorId: string): Promise<{ data: unknown; confidence: number } | null>;
  requestAction(action: string, resource: string, params: Record<string, unknown>): Promise<{ allowed: boolean; reason?: string }>;
  log(level: "info" | "warn" | "error", message: string): void;
}

/**
 * Detect graspable objects from camera data.
 * Pure function — no side effects.
 *
 * @example
 * ```ts
 * const targets = detectGraspTargets(cameraData, 0.8);
 * ```
 */
export function detectGraspTargets(
  _data: unknown,
  confidence: number,
  minConfidence: number = 0.8,
): GraspTarget[] {
  // Reference implementation uses confidence-based simulation.
  // In production, this would use an ONNX model.
  if (confidence < minConfidence) {
    return [];
  }

  return [
    {
      label: "object",
      position: { x: 0.5, y: 0.0, z: 0.3 },
      confidence,
      graspWidth: 0.05,
    },
  ];
}

/**
 * Parse grip state from force/torque sensor reading.
 *
 * @example
 * ```ts
 * const grip = parseGripState(sensorData, 50);
 * ```
 */
export function parseGripState(
  data: unknown,
  maxForceNewtons: number = 50,
): GripState {
  const force = typeof data === "object" && data !== null && "force" in data
    ? (data as { force: number }).force
    : 0;

  return {
    forceNewtons: force,
    objectDetected: force > 1.0,
    forceExceeded: force > maxForceNewtons,
  };
}

/**
 * Main capsule execution entry point.
 * Executes one phase of the pick-and-place operation.
 *
 * @example
 * ```ts
 * const result = await execute(api, "detect");
 * ```
 */
export async function execute(
  api: CapsuleApi,
  phase: PickPlacePhase = "detect",
  config: PickPlaceConfig = { maxGripForceNewtons: 50, targetGripForceNewtons: 20, minGraspConfidence: 0.8 },
): Promise<PickPlaceResult> {
  api.log("info", `Pick-and-place phase: ${phase}`);

  switch (phase) {
    case "detect": {
      const cameraReading = await api.readSensor("camera_rgb");
      if (!cameraReading) {
        return { phase: "error", target: null, gripState: null, success: false, message: "No camera data" };
      }
      const targets = detectGraspTargets(cameraReading.data, cameraReading.confidence, config.minGraspConfidence);
      if (targets.length === 0) {
        return { phase: "detect", target: null, gripState: null, success: false, message: "No graspable objects detected" };
      }
      api.log("info", `Detected ${targets.length} graspable objects`);
      return { phase: "detect", target: targets[0]!, gripState: null, success: true, message: "Object detected" };
    }

    case "grasp": {
      // Open gripper first
      const openResult = await api.requestAction("call", "ros2:///gripper/open", {});
      if (!openResult.allowed) {
        return { phase: "error", target: null, gripState: null, success: false, message: `Gripper open denied: ${openResult.reason ?? "unknown"}` };
      }

      // Close gripper to grasp
      const closeResult = await api.requestAction("call", "ros2:///gripper/close", {
        targetForceNewtons: config.targetGripForceNewtons,
      });
      if (!closeResult.allowed) {
        return { phase: "error", target: null, gripState: null, success: false, message: `Gripper close denied: ${closeResult.reason ?? "unknown"}` };
      }

      // Check grip
      const ftReading = await api.readSensor("force_torque");
      const gripState = ftReading ? parseGripState(ftReading.data, config.maxGripForceNewtons) : null;

      if (gripState?.forceExceeded) {
        api.log("error", "Force exceeded during grasp — releasing");
        await api.requestAction("call", "ros2:///gripper/open", {});
        return { phase: "error", target: null, gripState, success: false, message: "Force limit exceeded" };
      }

      const success = gripState?.objectDetected ?? false;
      api.log("info", success ? "Object grasped successfully" : "Grasp failed — no object detected");
      return { phase: "grasp", target: null, gripState, success, message: success ? "Grasped" : "No object in grip" };
    }

    case "release": {
      const releaseResult = await api.requestAction("call", "ros2:///gripper/open", {});
      if (!releaseResult.allowed) {
        return { phase: "error", target: null, gripState: null, success: false, message: `Release denied: ${releaseResult.reason ?? "unknown"}` };
      }
      api.log("info", "Object released");
      return { phase: "release", target: null, gripState: null, success: true, message: "Released" };
    }

    default: {
      return { phase, target: null, gripState: null, success: false, message: `Phase ${phase} not yet implemented` };
    }
  }
}
