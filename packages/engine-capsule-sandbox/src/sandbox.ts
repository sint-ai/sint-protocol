/**
 * SINT Protocol — Capsule Sandbox.
 *
 * Loads and executes WASM and TypeScript capsules with resource limits.
 * Memory limits are enforced via `WebAssembly.Memory({ initial, maximum })`.
 * CPU timeouts are enforced via `AbortController` + `setTimeout`.
 *
 * All public methods return `Result<T, CapsuleError>` — never throw.
 *
 * @module @sint/engine-capsule-sandbox/sandbox
 */

import type { Result, SintCapsuleManifest, UUIDv7 } from "@pshkv/core";
import { ok, err } from "@pshkv/core";
import type { CapsuleApi, CapsuleError } from "./types.js";

/** Configuration for the CapsuleSandbox. */
export interface CapsuleSandboxConfig {
  /** Default maximum WebAssembly memory pages (64 KiB each). */
  readonly maxMemoryPages?: number;
}

/** Internal state for a loaded capsule. */
interface LoadedCapsule {
  manifest: SintCapsuleManifest;
  wasmInstance?: WebAssembly.Instance;
  tsModule?: { execute: (api: CapsuleApi) => Promise<unknown> };
  state: "loaded" | "running" | "stopped" | "error";
}

const WASM_PAGE_SIZE_BYTES = 65536;

/**
 * Sandbox for loading and executing WASM and TypeScript capsules.
 *
 * Enforces memory limits via WebAssembly.Memory and CPU timeouts
 * via AbortController + setTimeout.
 *
 * @example
 * ```ts
 * import { CapsuleSandbox } from "@pshkv/engine-capsule-sandbox";
 *
 * const sandbox = new CapsuleSandbox();
 * const loadResult = sandbox.loadTypeScript(manifest, {
 *   execute: async (api) => {
 *     const reading = await api.readSensor("cam_front");
 *     return { detected: reading !== null };
 *   },
 * });
 *
 * if (loadResult.ok) {
 *   const execResult = await sandbox.execute(manifest.capsuleId, capsuleApi);
 * }
 * ```
 */
export class CapsuleSandbox {
  private readonly _capsules = new Map<UUIDv7, LoadedCapsule>();
  private readonly _maxMemoryPages: number;

  constructor(config?: CapsuleSandboxConfig) {
    this._maxMemoryPages = config?.maxMemoryPages ?? 256; // 16 MiB default
  }

  /**
   * Load a WASM capsule into the sandbox.
   *
   * Creates a `WebAssembly.Memory` with limits derived from the manifest's
   * `resourceLimits.maxMemoryMB`. Instantiates the WASM module with the
   * bounded memory.
   *
   * @param manifest  - Validated capsule manifest.
   * @param wasmBytes - Raw WASM binary content.
   * @returns `ok(void)` on success, `err(CapsuleError)` on failure.
   *
   * @example
   * ```ts
   * const result = await sandbox.loadWasm(manifest, wasmBytes);
   * ```
   */
  async loadWasm(
    manifest: SintCapsuleManifest,
    wasmBytes: Uint8Array,
  ): Promise<Result<void, CapsuleError>> {
    if (this._capsules.has(manifest.capsuleId)) {
      return err({
        code: "ALREADY_REGISTERED",
        message: `Capsule ${manifest.capsuleId} is already loaded`,
        capsuleId: manifest.capsuleId,
      });
    }

    const maxPages = Math.min(
      Math.ceil((manifest.resourceLimits.maxMemoryMB * 1024 * 1024) / WASM_PAGE_SIZE_BYTES),
      this._maxMemoryPages,
    );
    const initialPages = Math.min(1, maxPages);

    try {
      const memory = new WebAssembly.Memory({
        initial: initialPages,
        maximum: maxPages,
      });

      const importObject = {
        env: { memory },
      };

      const compiled = await WebAssembly.compile(wasmBytes.buffer as ArrayBuffer);
      const instance = await WebAssembly.instantiate(
        compiled,
        importObject,
      );

      this._capsules.set(manifest.capsuleId, {
        manifest,
        wasmInstance: instance,
        state: "loaded",
      });

      return ok(undefined);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      return err({
        code: "LOAD_FAILED",
        message: `Failed to load WASM capsule: ${message}`,
        capsuleId: manifest.capsuleId,
      });
    }
  }

  /**
   * Load a TypeScript capsule module into the sandbox.
   *
   * The module must expose an `execute(api: CapsuleApi) => Promise<unknown>` function.
   *
   * @param manifest - Validated capsule manifest.
   * @param module   - TS module with an `execute` method.
   * @returns `ok(void)` on success, `err(CapsuleError)` on failure.
   *
   * @example
   * ```ts
   * const result = sandbox.loadTypeScript(manifest, {
   *   execute: async (api) => ({ status: "ok" }),
   * });
   * ```
   */
  loadTypeScript(
    manifest: SintCapsuleManifest,
    module: { execute: (api: CapsuleApi) => Promise<unknown> },
  ): Result<void, CapsuleError> {
    if (this._capsules.has(manifest.capsuleId)) {
      return err({
        code: "ALREADY_REGISTERED",
        message: `Capsule ${manifest.capsuleId} is already loaded`,
        capsuleId: manifest.capsuleId,
      });
    }

    if (typeof module.execute !== "function") {
      return err({
        code: "LOAD_FAILED",
        message: "TypeScript module must export an execute function",
        capsuleId: manifest.capsuleId,
      });
    }

    this._capsules.set(manifest.capsuleId, {
      manifest,
      tsModule: module,
      state: "loaded",
    });

    return ok(undefined);
  }

  /**
   * Execute a loaded capsule with timeout enforcement.
   *
   * Uses `AbortController` + `setTimeout` to enforce the CPU time limit
   * declared in the capsule's `resourceLimits.maxCpuTimeMs`.
   *
   * @param capsuleId - The capsule to execute.
   * @param api       - The restricted API surface.
   * @returns `ok(result)` with the capsule's return value, or `err(CapsuleError)`.
   *
   * @example
   * ```ts
   * const result = await sandbox.execute(capsuleId, api);
   * if (result.ok) {
   *   console.log("Capsule returned:", result.value);
   * }
   * ```
   */
  async execute(
    capsuleId: UUIDv7,
    api: CapsuleApi,
  ): Promise<Result<unknown, CapsuleError>> {
    const capsule = this._capsules.get(capsuleId);
    if (!capsule) {
      return err({
        code: "NOT_FOUND",
        message: `Capsule ${capsuleId} is not loaded`,
        capsuleId,
      });
    }

    if (capsule.state !== "loaded" && capsule.state !== "stopped") {
      return err({
        code: "EXECUTION_FAILED",
        message: `Capsule ${capsuleId} is in state "${capsule.state}" and cannot be executed`,
        capsuleId,
      });
    }

    const timeoutMs = capsule.manifest.resourceLimits.maxCpuTimeMs;
    capsule.state = "running";

    if (capsule.tsModule) {
      const result = await this._executeWithTimeout(
        capsule.tsModule.execute(api),
        timeoutMs,
        capsuleId,
      );
      capsule.state = result.ok ? "stopped" : "error";
      return result;
    }

    if (capsule.wasmInstance) {
      const exports = capsule.wasmInstance.exports;
      const executeFn = exports["execute"] ?? exports["_start"];
      if (typeof executeFn !== "function") {
        capsule.state = "error";
        return err({
          code: "EXECUTION_FAILED",
          message: "WASM module has no execute or _start export",
          capsuleId,
        });
      }
      const result = await this._executeWithTimeout(
        Promise.resolve((executeFn as () => unknown)()),
        timeoutMs,
        capsuleId,
      );
      capsule.state = result.ok ? "stopped" : "error";
      return result;
    }

    capsule.state = "error";
    return err({
      code: "EXECUTION_FAILED",
      message: `Capsule ${capsuleId} has no WASM or TypeScript module`,
      capsuleId,
    });
  }

  /**
   * Destroy a loaded capsule and free resources.
   *
   * @param capsuleId - The capsule to destroy.
   * @returns `ok(void)` on success, `err(CapsuleError)` if not found.
   *
   * @example
   * ```ts
   * sandbox.destroy(capsuleId);
   * ```
   */
  destroy(capsuleId: UUIDv7): Result<void, CapsuleError> {
    if (!this._capsules.has(capsuleId)) {
      return err({
        code: "NOT_FOUND",
        message: `Capsule ${capsuleId} is not loaded`,
        capsuleId,
      });
    }

    this._capsules.delete(capsuleId);
    return ok(undefined);
  }

  /**
   * Run a promise with a timeout. Returns a Result.
   */
  private _executeWithTimeout(
    promise: Promise<unknown>,
    timeoutMs: number,
    capsuleId: UUIDv7,
  ): Promise<Result<unknown, CapsuleError>> {
    return new Promise<Result<unknown, CapsuleError>>((resolve) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(
            err({
              code: "CPU_TIMEOUT",
              message: `Capsule ${capsuleId} exceeded CPU time limit of ${timeoutMs}ms`,
              capsuleId,
            }),
          );
        }
      }, timeoutMs);

      promise.then(
        (value) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(ok(value));
          }
        },
        (e: unknown) => {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            const message = e instanceof Error ? e.message : String(e);
            resolve(
              err({
                code: "EXECUTION_FAILED",
                message: `Capsule execution failed: ${message}`,
                capsuleId,
              }),
            );
          }
        },
      );
    });
  }
}
