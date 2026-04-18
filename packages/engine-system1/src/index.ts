/**
 * SINT Protocol — Engine System 1 (Neural Perception).
 *
 * System 1 provides the fast, reactive perception pipeline for the
 * SINT Protocol Engine Layer (L3). It handles sensor fusion, ONNX-based
 * neural inference, anomaly detection, and action prediction.
 *
 * @example
 * ```ts
 * import { SensorBus, OnnxExecutor, PerceptionPipeline } from "@sint-ai/engine-system1";
 *
 * const bus = new SensorBus();
 * const executor = OnnxExecutor.createMock();
 * const pipeline = new PerceptionPipeline(bus, executor);
 * pipeline.start();
 * ```
 *
 * @module @sint/engine-system1
 */

export type {
  SensorSource,
  PerceptionConfig,
  AnomalyConfig,
  OnnxModelExecutor,
} from "./types.js";
export {
  DEFAULT_PERCEPTION_CONFIG,
  DEFAULT_ANOMALY_CONFIG,
} from "./types.js";
export { SensorBus } from "./sensor-bus.js";
export { OnnxExecutor } from "./onnx-executor.js";
export { PerceptionPipeline } from "./perception-pipeline.js";
export { AnomalyDetector } from "./anomaly-detector.js";
export { ActionPredictor } from "./action-predictor.js";
