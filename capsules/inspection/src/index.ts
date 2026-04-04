/**
 * Inspection Capsule — Visual anomaly detection for manufacturing QA.
 *
 * This is a T0_OBSERVE capsule: it reads camera data and classifies
 * defects without commanding any actuators. No physical state change.
 *
 * @module capsule/inspection
 *
 * @example
 * ```ts
 * const result = await execute(api);
 * if (result.hasDefects) {
 *   console.log(`Found ${result.defects.length} defects`);
 * }
 * ```
 */

import type {
  DefectClassification,
  InspectionConfig,
  InspectionResult,
} from "./types.js";

export type { DefectClassification, InspectionConfig, InspectionResult };
export { DEFAULT_INSPECTION_CONFIG } from "./types.js";

/**
 * CapsuleApi interface expected by the sandbox.
 * This is provided by the capsule sandbox at runtime.
 */
interface CapsuleApi {
  readSensor(sensorId: string): Promise<{ data: unknown; confidence: number } | null>;
  requestAction(action: string, resource: string, params: Record<string, unknown>): Promise<{ allowed: boolean; reason?: string }>;
  log(level: "info" | "warn" | "error", message: string): void;
}

/**
 * Analyze raw camera data and classify defects.
 * Pure function — no side effects.
 *
 * @example
 * ```ts
 * const defects = classifyDefects(cameraData, 0.7);
 * ```
 */
export function classifyDefects(
  _data: unknown,
  confidence: number,
  config: InspectionConfig = { confidenceThreshold: 0.7, maxDefectsPerFrame: 10 },
): DefectClassification[] {
  // In production, this would run an ONNX model.
  // Reference implementation uses confidence-based simulation.
  const defects: DefectClassification[] = [];

  // Simulate: if confidence is low, report a potential defect
  if (confidence < config.confidenceThreshold) {
    defects.push({
      label: "surface_anomaly",
      confidence: 1.0 - confidence,
      region: { x: 0.3, y: 0.3, width: 0.4, height: 0.4 },
    });
  }

  return defects.slice(0, config.maxDefectsPerFrame);
}

/**
 * Main capsule execution entry point.
 * Called by the CapsuleSandbox.
 *
 * @example
 * ```ts
 * const result = await execute(capsuleApi);
 * ```
 */
export async function execute(
  api: CapsuleApi,
  config: InspectionConfig = { confidenceThreshold: 0.7, maxDefectsPerFrame: 10 },
): Promise<InspectionResult> {
  api.log("info", "Starting visual inspection cycle");

  const reading = await api.readSensor("camera_rgb");

  if (!reading) {
    api.log("warn", "No camera data available");
    return {
      timestamp: new Date().toISOString(),
      hasDefects: false,
      defects: [],
      qualityScore: 0,
    };
  }

  const defects = classifyDefects(reading.data, reading.confidence, config);
  const hasDefects = defects.length > 0;
  const qualityScore = hasDefects
    ? Math.max(0, 1.0 - defects.reduce((sum, d) => sum + d.confidence, 0) / defects.length)
    : 1.0;

  api.log("info", `Inspection complete: ${defects.length} defects, quality=${qualityScore.toFixed(2)}`);

  return {
    timestamp: new Date().toISOString(),
    hasDefects,
    defects,
    qualityScore,
  };
}
