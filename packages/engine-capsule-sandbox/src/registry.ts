/**
 * SINT Protocol — Capsule Registry.
 *
 * In-memory catalog of registered capsule instances. Supports
 * registration, lookup, listing, and filtering by sensor modality.
 *
 * All methods return `Result<T, CapsuleError>` — never throw.
 *
 * @module @sint/engine-capsule-sandbox/registry
 */

import type {
  Result,
  SintCapsuleManifest,
  SintSensorModality,
  UUIDv7,
} from "@sint/core";
import { ok, err } from "@sint/core";
import type { CapsuleError, CapsuleInstance } from "./types.js";
import { validateManifest } from "./manifest-validator.js";

/**
 * In-memory registry for capsule instances.
 *
 * @example
 * ```ts
 * import { CapsuleRegistry } from "@sint/engine-capsule-sandbox";
 *
 * const registry = new CapsuleRegistry();
 * const result = registry.register(manifest);
 * if (result.ok) {
 *   const capsule = registry.get(manifest.capsuleId);
 *   console.log(capsule.ok && capsule.value.state); // "registered"
 * }
 * ```
 */
export class CapsuleRegistry {
  private readonly _capsules = new Map<UUIDv7, CapsuleInstance>();

  /**
   * Register a new capsule from its manifest.
   *
   * Validates the manifest before registration.
   * Returns `ALREADY_REGISTERED` if the capsuleId is already in the registry.
   *
   * @param manifest - The capsule manifest to register.
   * @returns `ok(void)` on success, `err(CapsuleError)` on failure.
   *
   * @example
   * ```ts
   * const result = registry.register(manifest);
   * ```
   */
  register(manifest: SintCapsuleManifest): Result<void, CapsuleError> {
    // Validate manifest structure
    const validation = validateManifest(manifest);
    if (!validation.ok) {
      return validation as Result<never, CapsuleError>;
    }

    if (this._capsules.has(manifest.capsuleId)) {
      return err({
        code: "ALREADY_REGISTERED",
        message: `Capsule ${manifest.capsuleId} is already registered`,
        capsuleId: manifest.capsuleId,
      });
    }

    const instance: CapsuleInstance = {
      manifest,
      state: "registered",
      executionCount: 0,
    };

    this._capsules.set(manifest.capsuleId, instance);
    return ok(undefined);
  }

  /**
   * Remove a capsule from the registry.
   *
   * @param capsuleId - The capsule to unregister.
   * @returns `ok(void)` on success, `err(CapsuleError)` if not found.
   *
   * @example
   * ```ts
   * registry.unregister(capsuleId);
   * ```
   */
  unregister(capsuleId: UUIDv7): Result<void, CapsuleError> {
    if (!this._capsules.has(capsuleId)) {
      return err({
        code: "NOT_FOUND",
        message: `Capsule ${capsuleId} is not registered`,
        capsuleId,
      });
    }

    this._capsules.delete(capsuleId);
    return ok(undefined);
  }

  /**
   * Retrieve a capsule instance by ID.
   *
   * @param capsuleId - The capsule to look up.
   * @returns `ok(CapsuleInstance)` on success, `err(CapsuleError)` if not found.
   *
   * @example
   * ```ts
   * const result = registry.get(capsuleId);
   * if (result.ok) console.log(result.value.manifest.name);
   * ```
   */
  get(capsuleId: UUIDv7): Result<CapsuleInstance, CapsuleError> {
    const instance = this._capsules.get(capsuleId);
    if (!instance) {
      return err({
        code: "NOT_FOUND",
        message: `Capsule ${capsuleId} is not registered`,
        capsuleId,
      });
    }

    return ok(instance);
  }

  /**
   * List all registered capsule instances.
   *
   * @returns Readonly array of all capsule instances.
   *
   * @example
   * ```ts
   * const all = registry.list();
   * console.log(`${all.length} capsules registered`);
   * ```
   */
  list(): readonly CapsuleInstance[] {
    return Array.from(this._capsules.values());
  }

  /**
   * Filter capsules by required sensor modality.
   *
   * Returns all capsules whose manifests declare the given sensor modality.
   *
   * @param modality - The sensor modality to filter by.
   * @returns Readonly array of matching capsule instances.
   *
   * @example
   * ```ts
   * const cameraCapsules = registry.filterBySensor("camera_rgb");
   * ```
   */
  filterBySensor(modality: SintSensorModality): readonly CapsuleInstance[] {
    return Array.from(this._capsules.values()).filter((instance) =>
      instance.manifest.sensors.includes(modality),
    );
  }
}
