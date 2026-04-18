/**
 * SINT Protocol — Engine HAL internal types.
 *
 * Resource monitoring types and threshold configuration used
 * by the Hardware Abstraction Layer to track system resource
 * utilization and trigger alerts.
 *
 * @module @sint/engine-hal/types
 */

import type { ISO8601, SintHardwareDeploymentProfile } from "@sint-ai/core";

/**
 * A point-in-time snapshot of system resource utilization.
 *
 * @example
 * ```ts
 * const snapshot: ResourceSnapshot = {
 *   cpuUsagePercent: 42.5,
 *   memoryUsedMB: 2048,
 *   memoryTotalMB: 8192,
 *   timestamp: "2026-03-17T10:00:00.000000Z",
 * };
 * ```
 */
export interface ResourceSnapshot {
  readonly cpuUsagePercent: number;
  readonly memoryUsedMB: number;
  readonly memoryTotalMB: number;
  readonly gpuUsagePercent?: number;
  readonly gpuMemoryUsedMB?: number;
  readonly timestamp: ISO8601;
}

/**
 * Threshold percentages that trigger warning and critical alerts
 * for CPU and memory utilization.
 *
 * @example
 * ```ts
 * const thresholds: ResourceThresholds = {
 *   cpuWarningPercent: 80,
 *   cpuCriticalPercent: 95,
 *   memoryWarningPercent: 85,
 *   memoryCriticalPercent: 95,
 * };
 * ```
 */
export interface ResourceThresholds {
  readonly cpuWarningPercent: number;
  readonly cpuCriticalPercent: number;
  readonly memoryWarningPercent: number;
  readonly memoryCriticalPercent: number;
}

/** Default resource thresholds used when none are specified. */
export const DEFAULT_THRESHOLDS: ResourceThresholds = {
  cpuWarningPercent: 80,
  cpuCriticalPercent: 95,
  memoryWarningPercent: 85,
  memoryCriticalPercent: 95,
};

/**
 * Configuration for the SINT Engine HAL.
 *
 * @example
 * ```ts
 * const config: EngineConfig = {
 *   deploymentProfile: "edge",
 *   resourceThresholds: { cpuWarningPercent: 70 },
 *   samplingIntervalMs: 3000,
 * };
 * ```
 */
export interface EngineConfig {
  readonly deploymentProfile?: SintHardwareDeploymentProfile;
  readonly resourceThresholds?: Partial<ResourceThresholds>;
  readonly samplingIntervalMs?: number;
}
