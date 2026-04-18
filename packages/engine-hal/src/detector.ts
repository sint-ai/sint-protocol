/**
 * SINT Protocol — Hardware detection.
 *
 * Auto-detects the host hardware capabilities including CPU architecture,
 * platform, memory, GPU presence, and Jetson platform identification.
 * Returns a fully populated {@link SintHardwareProfile} with an
 * auto-selected deployment profile.
 *
 * @module @sint/engine-hal/detector
 */

import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import os from "node:os";

import type { SintHardwareProfile } from "@pshkv/core";
import { ok, err } from "@pshkv/core";
import type { Result } from "@pshkv/core";

import { selectDeploymentProfile } from "./profiler.js";

/**
 * GPU information parsed from nvidia-smi output.
 */
interface GpuInfo {
  readonly name: string;
  readonly computeCapability?: string;
  readonly memoryMB?: number;
}

/**
 * Attempt to read the Jetson platform identifier from the device tree.
 *
 * @returns The model string if running on a Jetson platform, or `null` otherwise
 */
function detectJetsonPlatform(): string | null {
  try {
    const model = readFileSync("/proc/device-tree/model", "utf-8").replace(/\0/g, "").trim();
    return model || null;
  } catch {
    return null;
  }
}

/**
 * Attempt to detect an NVIDIA GPU using nvidia-smi.
 *
 * @returns GPU information if an NVIDIA GPU is detected, or `null` otherwise
 */
function detectNvidiaGpu(): GpuInfo | null {
  try {
    const output = execSync(
      "nvidia-smi --query-gpu=gpu_name,compute_cap,memory.total --format=csv,noheader,nounits",
      { encoding: "utf-8", timeout: 5_000, stdio: ["pipe", "pipe", "pipe"] },
    ).trim();

    if (!output) {
      return null;
    }

    const parts = output.split(",").map((s) => s.trim());
    const name = parts[0];
    const computeCap = parts[1];
    const memoryStr = parts[2];

    if (!name) {
      return null;
    }

    const result: GpuInfo = {
      name,
      computeCapability: computeCap || undefined,
      memoryMB: memoryStr ? Math.round(Number(memoryStr)) : undefined,
    };

    return result;
  } catch {
    return null;
  }
}

/**
 * Detect host hardware and return a complete hardware profile.
 *
 * Probes the system for:
 * - CPU architecture via `os.arch()`
 * - Platform via `os.platform()`
 * - CPU core count via `os.cpus().length`
 * - Total memory via `os.totalmem()`
 * - Jetson platform via `/proc/device-tree/model`
 * - NVIDIA GPU via `nvidia-smi`
 *
 * The deployment profile is automatically selected based on detected capabilities.
 *
 * @returns A Result containing the hardware profile, or an error if detection fails
 *
 * @example
 * ```ts
 * const result = await detectHardware();
 * if (result.ok) {
 *   console.log(result.value.deploymentProfile); // "edge"
 *   console.log(result.value.arch);              // "arm64"
 * }
 * ```
 */
export async function detectHardware(): Promise<Result<SintHardwareProfile, Error>> {
  try {
    const arch = os.arch();
    const platform = os.platform();
    const cpuCores = os.cpus().length;
    const totalMemoryMB = Math.round(os.totalmem() / (1024 * 1024));

    // Detect Jetson platform (informational — logged but not used in profile selection)
    detectJetsonPlatform();

    // Detect NVIDIA GPU
    const gpuDetection = detectNvidiaGpu();

    const gpuInfo: SintHardwareProfile["gpuInfo"] = gpuDetection
      ? {
          name: gpuDetection.name,
          computeCapability: gpuDetection.computeCapability,
          memoryMB: gpuDetection.memoryMB,
        }
      : null;

    const deploymentProfile = selectDeploymentProfile({
      arch,
      platform,
      cpuCores,
      totalMemoryMB,
      hasGpu: gpuInfo !== null,
    });

    const profile: SintHardwareProfile = {
      arch,
      platform,
      cpuCores,
      totalMemoryMB,
      gpuInfo,
      deploymentProfile,
    };

    return ok(profile);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err(new Error(`Hardware detection failed: ${message}`));
  }
}
