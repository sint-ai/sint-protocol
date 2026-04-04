/**
 * SINT Protocol — Capsule manifest validation.
 *
 * Validates capsule manifests using the Zod schema from `@sint/core`.
 * Returns a typed `Result` — never throws.
 *
 * @module @sint/engine-capsule-sandbox/manifest-validator
 */

import type { Result, SintCapsuleManifest } from "@sint/core";
import { ok, err } from "@sint/core";
import { capsuleManifestSchema } from "@sint/core";
import type { CapsuleError } from "./types.js";

/**
 * Validate a raw manifest object against the SCS-1 schema.
 *
 * Uses `capsuleManifestSchema` from `@sint/core` for Zod validation.
 * Pure function with no side effects.
 *
 * @param manifest - Unknown input to validate.
 * @returns `ok(SintCapsuleManifest)` on success, `err(CapsuleError)` on failure.
 *
 * @example
 * ```ts
 * import { validateManifest } from "@sint/engine-capsule-sandbox";
 *
 * const result = validateManifest({
 *   capsuleId: "01905f7c-0000-7000-8000-000000000001",
 *   version: "1.0.0",
 *   name: "visual-inspection",
 *   author: "sint-labs",
 *   sensors: ["camera_rgb"],
 *   actuators: [],
 *   safetyDeclarations: {},
 *   resourceLimits: { maxMemoryMB: 256, maxCpuTimeMs: 5000, maxStorageMB: 50 },
 *   runtime: "typescript",
 *   entryPoint: "src/index.ts",
 *   contentHash: "a".repeat(64),
 * });
 *
 * if (result.ok) {
 *   console.log("Valid:", result.value.name);
 * } else {
 *   console.error(result.error.code, result.error.message);
 * }
 * ```
 */
export function validateManifest(
  manifest: unknown,
): Result<SintCapsuleManifest, CapsuleError> {
  const parsed = capsuleManifestSchema.safeParse(manifest);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");

    return err({
      code: "MANIFEST_INVALID",
      message: `Manifest validation failed: ${issues}`,
    });
  }

  return ok(parsed.data as SintCapsuleManifest);
}
