/**
 * SINT Protocol — Engine System 1 internal types.
 *
 * Configuration interfaces and defaults for the neural perception pipeline.
 * These types are used internally by the sensor bus, perception pipeline,
 * anomaly detector, and ONNX executor.
 *
 * @module @sint/engine-system1/types
 */

import type { Result, SintSensorModality } from "@sint/core";

/**
 * Describes a sensor source registered with the SensorBus.
 *
 * @example
 * ```ts
 * const source: SensorSource = {
 *   sensorId: "cam_front_rgb",
 *   modality: "camera_rgb",
 *   bufferSize: 100,
 * };
 * ```
 */
export interface SensorSource {
  readonly sensorId: string;
  readonly modality: SintSensorModality;
  readonly bufferSize: number;
}

/**
 * Configuration for the perception pipeline.
 *
 * @example
 * ```ts
 * const config: PerceptionConfig = {
 *   inferenceHz: 20,
 *   maxSensors: 8,
 *   ringBufferSize: 200,
 *   anomalyThreshold: 0.25,
 * };
 * ```
 */
export interface PerceptionConfig {
  readonly inferenceHz: number;
  readonly maxSensors: number;
  readonly ringBufferSize: number;
  readonly anomalyThreshold: number;
}

/** Default perception pipeline configuration. */
export const DEFAULT_PERCEPTION_CONFIG: PerceptionConfig = {
  inferenceHz: 10,
  maxSensors: 16,
  ringBufferSize: 100,
  anomalyThreshold: 0.3,
};

/**
 * Configuration for the anomaly detector.
 *
 * @example
 * ```ts
 * const config: AnomalyConfig = {
 *   confidenceThreshold: 0.6,
 *   distributionShiftSigma: 2.5,
 *   windowSize: 100,
 * };
 * ```
 */
export interface AnomalyConfig {
  readonly confidenceThreshold: number;
  readonly distributionShiftSigma: number;
  readonly windowSize: number;
}

/** Default anomaly detector configuration. */
export const DEFAULT_ANOMALY_CONFIG: AnomalyConfig = {
  confidenceThreshold: 0.5,
  distributionShiftSigma: 3.0,
  windowSize: 50,
};

/**
 * Interface for ONNX model executor (injectable, mockable).
 *
 * Implementations can wrap onnxruntime-node for production or provide
 * a mock executor for testing. Use {@link OnnxExecutor.createMock} for tests.
 *
 * @example
 * ```ts
 * const executor: OnnxModelExecutor = OnnxExecutor.createMock();
 * await executor.loadModel("model.onnx");
 * const result = await executor.runInference(new Float32Array([1, 2, 3]));
 * ```
 */
export interface OnnxModelExecutor {
  loadModel(modelPath: string): Promise<Result<void, Error>>;
  runInference(input: Float32Array): Promise<Result<Float32Array, Error>>;
  dispose(): void;
}
