/**
 * SINT Protocol — Deployment profile selection.
 *
 * Pure functions that map hardware specifications to the appropriate
 * SINT deployment profile. No side effects, no I/O.
 *
 * @module @sint/engine-hal/profiler
 */

import type { SintHardwareDeploymentProfile } from "@sint-ai/core";

/**
 * Hardware specifications used for deployment profile selection.
 */
export interface HardwareSpecs {
  readonly arch: string;
  readonly platform: string;
  readonly cpuCores: number;
  readonly totalMemoryMB: number;
  readonly hasGpu: boolean;
}

/**
 * Select the optimal SINT deployment profile based on detected hardware.
 *
 * Selection logic:
 * - darwin (any) -> "edge" (development machine)
 * - arm64 + GPU + >=16GB RAM -> "full" (Jetson Orin)
 * - arm64 + no GPU + <4GB -> "lite" (RPi Zero/3)
 * - arm64 + >=4GB -> "edge" (RPi 4/5)
 * - x64 + GPU -> "full" (workstation)
 * - x64 + >=16GB -> "edge" (NUC)
 * - x64 + <16GB -> "lite"
 * - Default fallback -> "lite"
 *
 * @param specs - Detected hardware specifications
 * @returns The recommended deployment profile
 *
 * @example
 * ```ts
 * const profile = selectDeploymentProfile({
 *   arch: "arm64",
 *   platform: "linux",
 *   cpuCores: 8,
 *   totalMemoryMB: 32768,
 *   hasGpu: true,
 * });
 * // profile === "full"
 * ```
 */
export function selectDeploymentProfile(specs: HardwareSpecs): SintHardwareDeploymentProfile {
  // darwin (macOS) is always treated as a development machine
  if (specs.platform === "darwin") {
    return "edge";
  }

  if (specs.arch === "arm64") {
    if (specs.hasGpu && specs.totalMemoryMB >= 16_384) {
      return "full"; // Jetson Orin
    }
    if (!specs.hasGpu && specs.totalMemoryMB < 4_096) {
      return "lite"; // RPi Zero/3
    }
    return "edge"; // RPi 4/5
  }

  if (specs.arch === "x64") {
    if (specs.hasGpu) {
      return "full"; // Workstation with GPU
    }
    if (specs.totalMemoryMB >= 16_384) {
      return "edge"; // NUC or similar
    }
    return "lite";
  }

  // Unknown architecture — safest fallback
  return "lite";
}

/**
 * Check whether the given deployment profile supports ONNX inference.
 *
 * Only "full" and "edge" profiles have sufficient resources for
 * on-device model inference. "split" and "lite" profiles offload
 * inference to a remote server.
 *
 * @param profile - The deployment profile to check
 * @returns `true` if ONNX inference can run locally
 *
 * @example
 * ```ts
 * canRunOnnx("full");  // true
 * canRunOnnx("edge");  // true
 * canRunOnnx("split"); // false
 * canRunOnnx("lite");  // false
 * ```
 */
export function canRunOnnx(profile: SintHardwareDeploymentProfile): boolean {
  return profile === "full" || profile === "edge";
}
