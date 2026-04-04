/**
 * SINT Protocol — Engine Hardware Abstraction Layer (HAL).
 *
 * Auto-detects hardware capabilities, selects the optimal deployment
 * profile, monitors system resources, and loads engine configuration.
 *
 * @packageDocumentation
 * @module @sint/engine-hal
 */

export type { ResourceSnapshot, ResourceThresholds, EngineConfig } from "./types.js";
export { DEFAULT_THRESHOLDS } from "./types.js";

export type { HardwareSpecs } from "./profiler.js";
export { selectDeploymentProfile, canRunOnnx } from "./profiler.js";

export { detectHardware } from "./detector.js";

export type { ThresholdCallback } from "./resource-monitor.js";
export { ResourceMonitor } from "./resource-monitor.js";

export { loadEngineConfig } from "./config.js";
