/**
 * SINT Protocol — ONNX Model Executor for System 1 inference.
 *
 * Provides an injectable ONNX inference executor that dynamically loads
 * onnxruntime-node at runtime. If the runtime is not installed, the
 * executor fails gracefully with a Result error. A static mock factory
 * is provided for testing without any ONNX dependencies.
 *
 * @module @sint/engine-system1/onnx-executor
 */

import type { Result, SintHardwareDeploymentProfile } from "@sint-ai/core";
import { err, ok } from "@sint-ai/core";
import type { OnnxModelExecutor } from "./types.js";

/**
 * Maps deployment profiles to ONNX execution provider names.
 */
const PROVIDER_MAP: Record<SintHardwareDeploymentProfile, string> = {
  full: "cuda",
  edge: "cpu",
  split: "cpu",
  lite: "cpu",
};

/**
 * ONNX model executor with dynamic runtime loading.
 *
 * Attempts to load onnxruntime-node at runtime via dynamic import.
 * Falls back to a clear error if the package is not installed.
 * The execution provider is selected based on the deployment profile:
 * - full -> CUDA/TensorRT
 * - edge -> CPU
 * - split -> CPU
 * - lite -> CPU
 *
 * @example
 * ```ts
 * const executor = new OnnxExecutor("edge");
 * const loadResult = await executor.loadModel("/path/to/model.onnx");
 * if (loadResult.ok) {
 *   const inferResult = await executor.runInference(new Float32Array([1, 2, 3]));
 * }
 * ```
 */
export class OnnxExecutor implements OnnxModelExecutor {
  private readonly deploymentProfile: SintHardwareDeploymentProfile;
  private readonly provider: string;
  private session: unknown | null = null;
  private _modelLoaded = false;

  /**
   * Create an OnnxExecutor for the given deployment profile.
   *
   * @param deploymentProfile - Hardware deployment profile to select execution provider
   *
   * @example
   * ```ts
   * const executor = new OnnxExecutor("full");
   * ```
   */
  constructor(deploymentProfile: SintHardwareDeploymentProfile) {
    this.deploymentProfile = deploymentProfile;
    this.provider = PROVIDER_MAP[deploymentProfile]!;
  }

  /**
   * Get the selected execution provider name.
   *
   * @returns The ONNX execution provider string (e.g. "cuda", "cpu")
   *
   * @example
   * ```ts
   * const executor = new OnnxExecutor("full");
   * console.log(executor.getProvider()); // "cuda"
   * ```
   */
  getProvider(): string {
    return this.provider;
  }

  /**
   * Get the deployment profile this executor was created with.
   *
   * @returns The deployment profile
   *
   * @example
   * ```ts
   * const executor = new OnnxExecutor("edge");
   * console.log(executor.getDeploymentProfile()); // "edge"
   * ```
   */
  getDeploymentProfile(): SintHardwareDeploymentProfile {
    return this.deploymentProfile;
  }

  /**
   * Load an ONNX model from disk. Dynamically imports onnxruntime-node.
   *
   * @param modelPath - File path to the ONNX model
   * @returns Ok on success, Error if onnxruntime-node is not available or model loading fails
   *
   * @example
   * ```ts
   * const result = await executor.loadModel("./models/perception.onnx");
   * if (!result.ok) {
   *   console.error(result.error.message);
   * }
   * ```
   */
  async loadModel(modelPath: string): Promise<Result<void, Error>> {
    try {
      // Dynamic import — onnxruntime-node is an optional peer dependency.
      // Use indirect import to prevent TypeScript from resolving the module at compile time.
      const moduleName = "onnxruntime-node";
      // eslint-disable-next-line @typescript-eslint/no-implied-eval
      const ort = (await (new Function(`return import("${moduleName}")`)() as Promise<unknown>)) as Record<string, unknown>;
      const InferenceSession = ort["InferenceSession"] as {
        create(path: string, options: Record<string, unknown>): Promise<unknown>;
      } | undefined;

      if (!InferenceSession) {
        return err(new Error("onnxruntime-node does not export InferenceSession"));
      }

      this.session = await InferenceSession.create(modelPath, {
        executionProviders: [this.provider],
      });
      this._modelLoaded = true;
      return ok(undefined);
    } catch (_error: unknown) {
      const message =
        _error instanceof Error ? _error.message : "Unknown error loading ONNX model";
      return err(
        new Error(
          `Failed to load ONNX model: ${message}. ` +
            "Ensure onnxruntime-node is installed as an optional dependency.",
        ),
      );
    }
  }

  /**
   * Run inference on the loaded model.
   *
   * @param input - Input tensor data as Float32Array
   * @returns Output tensor data as Float32Array, or Error if model not loaded
   *
   * @example
   * ```ts
   * const result = await executor.runInference(new Float32Array([1.0, 2.0, 3.0]));
   * if (result.ok) {
   *   console.log("Output:", result.value);
   * }
   * ```
   */
  async runInference(input: Float32Array): Promise<Result<Float32Array, Error>> {
    if (!this._modelLoaded || !this.session) {
      return err(new Error("Model not loaded. Call loadModel() first."));
    }

    try {
      const session = this.session as {
        run(feeds: Record<string, unknown>): Promise<Record<string, { data: Float32Array }>>;
      };
      const results = await session.run({ input: { data: input } });
      const output = Object.values(results)[0];
      if (!output) {
        return err(new Error("Inference produced no output"));
      }
      return ok(output.data);
    } catch (_error: unknown) {
      const message =
        _error instanceof Error ? _error.message : "Unknown inference error";
      return err(new Error(`Inference failed: ${message}`));
    }
  }

  /**
   * Dispose of the ONNX session and release resources.
   *
   * @example
   * ```ts
   * executor.dispose();
   * ```
   */
  dispose(): void {
    if (this.session && typeof (this.session as { release?: () => void }).release === "function") {
      (this.session as { release: () => void }).release();
    }
    this.session = null;
    this._modelLoaded = false;
  }

  /**
   * Create a mock OnnxModelExecutor for testing.
   *
   * The mock executor succeeds on loadModel, returns a Float32Array of
   * the same length as input on runInference (filled with 0.5 values),
   * and is safe to dispose multiple times.
   *
   * @returns A mock OnnxModelExecutor that operates without onnxruntime-node
   *
   * @example
   * ```ts
   * const mock = OnnxExecutor.createMock();
   * await mock.loadModel("any-path.onnx"); // always succeeds
   * const result = await mock.runInference(new Float32Array([1, 2, 3]));
   * // result.value is Float32Array([0.5, 0.5, 0.5])
   * ```
   */
  static createMock(): OnnxModelExecutor {
    let loaded = false;

    return {
      async loadModel(_modelPath: string): Promise<Result<void, Error>> {
        loaded = true;
        return ok(undefined);
      },

      async runInference(input: Float32Array): Promise<Result<Float32Array, Error>> {
        if (!loaded) {
          return err(new Error("Model not loaded. Call loadModel() first."));
        }
        const output = new Float32Array(input.length);
        output.fill(0.5);
        return ok(output);
      },

      dispose(): void {
        loaded = false;
      },
    };
  }
}
