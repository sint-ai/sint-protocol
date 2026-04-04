/**
 * SINT Protocol — Perception Pipeline for System 1.
 *
 * Orchestrates the full perception cycle: sensor fusion, neural inference,
 * anomaly detection, action prediction, and event emission. Runs at a
 * configurable frequency (default 10 Hz) or can be invoked for a single
 * cycle via {@link PerceptionPipeline.runOnce}.
 *
 * @module @sint/engine-system1/perception-pipeline
 */

import type { Result, SintWorldState } from "@sint/core";
import { err, ok } from "@sint/core";
import type { OnnxModelExecutor, PerceptionConfig } from "./types.js";
import { DEFAULT_PERCEPTION_CONFIG } from "./types.js";
import { SensorBus } from "./sensor-bus.js";
import { AnomalyDetector } from "./anomaly-detector.js";
import { ActionPredictor } from "./action-predictor.js";

/**
 * Event payload emitted by the PerceptionPipeline.
 */
interface PipelineEvent {
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
}

/**
 * Orchestrates the System 1 perception cycle.
 *
 * Each cycle:
 * 1. Fuses sensor readings from the SensorBus into a world state
 * 2. Runs neural inference via the OnnxModelExecutor
 * 3. Detects anomalies with the AnomalyDetector
 * 4. Predicts actions with the ActionPredictor
 * 5. Emits inference events via the onEvent callback
 *
 * @example
 * ```ts
 * const pipeline = new PerceptionPipeline(sensorBus, mockExecutor, { inferenceHz: 20 });
 * pipeline.start();
 * // ... perception runs at 20 Hz ...
 * pipeline.stop();
 * ```
 */
export class PerceptionPipeline {
  private readonly sensorBus: SensorBus;
  private readonly modelExecutor: OnnxModelExecutor;
  private readonly config: PerceptionConfig;
  private readonly onEvent?: (event: PipelineEvent) => void;
  private readonly anomalyDetector: AnomalyDetector;
  private readonly actionPredictor: ActionPredictor;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;

  /**
   * Create a PerceptionPipeline.
   *
   * @param sensorBus - Sensor bus providing fused readings
   * @param modelExecutor - ONNX model executor for neural inference
   * @param config - Optional partial perception configuration
   * @param onEvent - Optional event callback for observability
   *
   * @example
   * ```ts
   * const pipeline = new PerceptionPipeline(
   *   sensorBus,
   *   OnnxExecutor.createMock(),
   *   { inferenceHz: 5 },
   *   (evt) => console.log(evt.eventType),
   * );
   * ```
   */
  constructor(
    sensorBus: SensorBus,
    modelExecutor: OnnxModelExecutor,
    config?: Partial<PerceptionConfig>,
    onEvent?: (event: PipelineEvent) => void,
  ) {
    this.sensorBus = sensorBus;
    this.modelExecutor = modelExecutor;
    this.config = { ...DEFAULT_PERCEPTION_CONFIG, ...config };
    this.onEvent = onEvent;
    this.anomalyDetector = new AnomalyDetector({
      confidenceThreshold: this.config.anomalyThreshold,
    });
    this.actionPredictor = new ActionPredictor(onEvent);
  }

  /**
   * Start periodic perception at the configured frequency.
   *
   * @example
   * ```ts
   * pipeline.start();
   * ```
   */
  start(): void {
    if (this.intervalHandle !== null) {
      return;
    }
    const intervalMs = Math.round(1000 / this.config.inferenceHz);
    this.intervalHandle = setInterval(() => {
      void this.runOnce();
    }, intervalMs);
  }

  /**
   * Stop periodic perception.
   *
   * @example
   * ```ts
   * pipeline.stop();
   * ```
   */
  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }

  /**
   * Whether the pipeline is currently running periodic perception.
   *
   * @returns true if the pipeline interval is active
   *
   * @example
   * ```ts
   * if (pipeline.isRunning()) {
   *   pipeline.stop();
   * }
   * ```
   */
  isRunning(): boolean {
    return this.intervalHandle !== null;
  }

  /**
   * Execute a single perception cycle.
   *
   * Steps:
   * 1. Fuse sensor readings into a world state
   * 2. Run ONNX inference (best-effort, does not fail the cycle)
   * 3. Detect anomalies and augment world state
   * 4. Predict action recommendation
   * 5. Emit inference event
   *
   * @returns The enriched world state with anomaly flags
   *
   * @example
   * ```ts
   * const result = await pipeline.runOnce();
   * if (result.ok) {
   *   console.log(`Detected ${result.value.objects.length} objects`);
   *   console.log(`Anomalies: ${result.value.anomalyFlags.length}`);
   * }
   * ```
   */
  async runOnce(): Promise<Result<SintWorldState, Error>> {
    const startTime = Date.now();

    // Step 1: Fuse sensor readings
    const fuseResult = this.sensorBus.fuseWorldState();
    if (!fuseResult.ok) {
      return err(fuseResult.error);
    }
    const baseWorldState = fuseResult.value;

    // Step 2: Run inference (best-effort — failure does not stop the cycle)
    let inferenceOutput: Float32Array | undefined;
    try {
      // Create a simple input from object confidences for inference
      const inputData = new Float32Array(
        baseWorldState.objects.map((obj) => obj.confidence),
      );
      if (inputData.length > 0) {
        const inferResult = await this.modelExecutor.runInference(inputData);
        if (inferResult.ok) {
          inferenceOutput = inferResult.value;
        }
      }
    } catch {
      // Inference failure is non-fatal — continue with sensor fusion data
    }

    // Step 3: Detect anomalies
    const anomalyFlags = this.anomalyDetector.analyze(baseWorldState);

    // Step 4: Build enriched world state with anomaly flags
    const enrichedWorldState: SintWorldState = {
      ...baseWorldState,
      anomalyFlags: [...baseWorldState.anomalyFlags, ...anomalyFlags],
    };

    // Step 5: Predict action (emits its own event)
    this.actionPredictor.predict(enrichedWorldState, inferenceOutput);

    // Step 6: Emit inference cycle event
    const durationMs = Date.now() - startTime;
    if (this.onEvent) {
      this.onEvent({
        eventType: "engine.system1.inference",
        payload: {
          durationMs,
          objectCount: enrichedWorldState.objects.length,
          anomalyCount: enrichedWorldState.anomalyFlags.length,
          humanPresent: enrichedWorldState.humanPresent,
          sensorCount: this.sensorBus.getSensorIds().length,
          hadInferenceOutput: inferenceOutput !== undefined,
        },
      });
    }

    return ok(enrichedWorldState);
  }
}
