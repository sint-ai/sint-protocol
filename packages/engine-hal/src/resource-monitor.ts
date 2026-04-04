/**
 * SINT Protocol — Resource monitor.
 *
 * Periodically samples CPU and memory utilization, compares against
 * configurable thresholds, and emits callbacks when warning or critical
 * levels are exceeded.
 *
 * @module @sint/engine-hal/resource-monitor
 */

import os from "node:os";

import { ok, err } from "@sint/core";
import type { Result, ISO8601 } from "@sint/core";

import type { ResourceSnapshot, ResourceThresholds } from "./types.js";
import { DEFAULT_THRESHOLDS } from "./types.js";

/** Callback signature for threshold exceeded events. */
export type ThresholdCallback = (snapshot: ResourceSnapshot, level: "warning" | "critical") => void;

/**
 * Monitors system resource utilization and emits alerts when thresholds are exceeded.
 *
 * @example
 * ```ts
 * const monitor = new ResourceMonitor({ cpuWarningPercent: 70 }, 3000);
 * monitor.onThresholdExceeded((snapshot, level) => {
 *   console.log(`${level}: CPU at ${snapshot.cpuUsagePercent}%`);
 * });
 * monitor.start();
 * // ... later ...
 * monitor.stop();
 * ```
 */
export class ResourceMonitor {
  private readonly _thresholds: ResourceThresholds;
  private readonly _samplingIntervalMs: number;
  private _intervalHandle: ReturnType<typeof setInterval> | null = null;
  private _callbacks: ThresholdCallback[] = [];
  private _previousCpuTimes: { idle: number; total: number } | null = null;

  /**
   * Create a new resource monitor.
   *
   * @param thresholds - Partial threshold overrides (merged with defaults)
   * @param samplingIntervalMs - How often to sample in milliseconds (default: 5000)
   */
  constructor(thresholds?: Partial<ResourceThresholds>, samplingIntervalMs?: number) {
    this._thresholds = {
      ...DEFAULT_THRESHOLDS,
      ...thresholds,
    };
    this._samplingIntervalMs = samplingIntervalMs ?? 5_000;
  }

  /**
   * Start periodic resource sampling.
   * If already started, this is a no-op.
   *
   * @example
   * ```ts
   * const monitor = new ResourceMonitor();
   * monitor.start();
   * ```
   */
  start(): void {
    if (this._intervalHandle !== null) {
      return;
    }

    this._previousCpuTimes = this._getCpuTimes();

    this._intervalHandle = setInterval(() => {
      const snapshotResult = this.getSnapshot();
      if (!snapshotResult.ok) {
        return;
      }
      this._checkThresholds(snapshotResult.value);
    }, this._samplingIntervalMs);
  }

  /**
   * Stop periodic resource sampling and clear all state.
   *
   * @example
   * ```ts
   * monitor.stop();
   * ```
   */
  stop(): void {
    if (this._intervalHandle !== null) {
      clearInterval(this._intervalHandle);
      this._intervalHandle = null;
    }
    this._previousCpuTimes = null;
  }

  /**
   * Take a point-in-time snapshot of current resource utilization.
   *
   * @returns A Result containing the resource snapshot
   *
   * @example
   * ```ts
   * const result = monitor.getSnapshot();
   * if (result.ok) {
   *   console.log(`CPU: ${result.value.cpuUsagePercent}%`);
   * }
   * ```
   */
  getSnapshot(): Result<ResourceSnapshot, Error> {
    try {
      const currentCpuTimes = this._getCpuTimes();
      let cpuUsagePercent = 0;

      if (this._previousCpuTimes !== null) {
        const idleDelta = currentCpuTimes.idle - this._previousCpuTimes.idle;
        const totalDelta = currentCpuTimes.total - this._previousCpuTimes.total;
        cpuUsagePercent = totalDelta > 0
          ? Math.round(((totalDelta - idleDelta) / totalDelta) * 10_000) / 100
          : 0;
      }

      this._previousCpuTimes = currentCpuTimes;

      const totalMemoryMB = Math.round(os.totalmem() / (1024 * 1024));
      const freeMemoryMB = Math.round(os.freemem() / (1024 * 1024));
      const memoryUsedMB = totalMemoryMB - freeMemoryMB;

      const now = new Date();
      const timestamp: ISO8601 = now.toISOString().replace(/(\.\d{3})Z$/, "$1000Z");

      const snapshot: ResourceSnapshot = {
        cpuUsagePercent,
        memoryUsedMB,
        memoryTotalMB: totalMemoryMB,
        timestamp,
      };

      return ok(snapshot);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return err(new Error(`Failed to capture resource snapshot: ${message}`));
    }
  }

  /**
   * Register a callback that fires when resource usage exceeds thresholds.
   *
   * @param callback - Function called with the snapshot and severity level
   *
   * @example
   * ```ts
   * monitor.onThresholdExceeded((snapshot, level) => {
   *   if (level === "critical") {
   *     console.error("System resources critically low!");
   *   }
   * });
   * ```
   */
  onThresholdExceeded(callback: ThresholdCallback): void {
    this._callbacks.push(callback);
  }

  /**
   * Aggregate CPU times across all cores.
   */
  private _getCpuTimes(): { idle: number; total: number } {
    const cpus = os.cpus();
    let idle = 0;
    let total = 0;

    for (const cpu of cpus) {
      idle += cpu.times.idle;
      total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
    }

    return { idle, total };
  }

  /**
   * Compare snapshot values against thresholds and emit callbacks.
   */
  private _checkThresholds(snapshot: ResourceSnapshot): void {
    const memoryPercent =
      snapshot.memoryTotalMB > 0
        ? (snapshot.memoryUsedMB / snapshot.memoryTotalMB) * 100
        : 0;

    // Check critical thresholds first (higher priority)
    if (
      snapshot.cpuUsagePercent >= this._thresholds.cpuCriticalPercent ||
      memoryPercent >= this._thresholds.memoryCriticalPercent
    ) {
      for (const cb of this._callbacks) {
        cb(snapshot, "critical");
      }
      return;
    }

    // Check warning thresholds
    if (
      snapshot.cpuUsagePercent >= this._thresholds.cpuWarningPercent ||
      memoryPercent >= this._thresholds.memoryWarningPercent
    ) {
      for (const cb of this._callbacks) {
        cb(snapshot, "warning");
      }
    }
  }
}
