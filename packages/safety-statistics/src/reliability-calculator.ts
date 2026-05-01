import type { FailureEvent, ReliabilityMetrics, ReliabilityTier } from './types.js';

/**
 * Computes reliability metrics from a stream of failure events.
 * Implements the Applied Intuition "nines of reliability" pattern.
 */
export class ReliabilityCalculator {
  /** Compute MTBF in hours given failures and total operating window. */
  static mtbfHours(failures: FailureEvent[], operatingWindowMs: number): number {
    if (failures.length === 0) {
      // No failures observed → MTBF is at least the operating window
      return operatingWindowMs / (1000 * 60 * 60);
    }
    return operatingWindowMs / (failures.length * 1000 * 60 * 60);
  }

  /** Compute mean time to recovery in minutes from resolved failures. */
  static mttrMinutes(failures: FailureEvent[]): number {
    const resolved = failures.filter(f => f.resolved && f.resolutionTimeMs);
    if (resolved.length === 0) return 0;
    const totalMs = resolved.reduce((sum, f) => sum + (f.resolutionTimeMs ?? 0), 0);
    return totalMs / resolved.length / (1000 * 60);
  }

  /** Compute availability: uptime / total time. */
  static availability(failures: FailureEvent[], operatingWindowMs: number): number {
    if (operatingWindowMs <= 0) return 0;
    const downtimeMs = failures
      .filter(f => f.resolved && f.resolutionTimeMs)
      .reduce((sum, f) => sum + (f.resolutionTimeMs ?? 0), 0);
    const uptime = Math.max(0, operatingWindowMs - downtimeMs);
    return uptime / operatingWindowMs;
  }

  /** Convert availability to "number of nines" (e.g. 0.999 → 3). */
  static toNines(availability: number): number {
    if (availability >= 1) return Infinity;
    if (availability <= 0) return 0;
    return -Math.log10(1 - availability);
  }

  /** Map availability to a reliability tier label. */
  static toTier(availability: number): ReliabilityTier {
    if (availability >= 0.99999) return 'safety';
    if (availability >= 0.9999) return 'critical';
    if (availability >= 0.999) return 'production';
    if (availability >= 0.99) return 'beta';
    return 'experimental';
  }

  /** Compute the full set of reliability metrics. */
  static compute(failures: FailureEvent[], operatingWindowMs: number): ReliabilityMetrics {
    const availability = this.availability(failures, operatingWindowMs);
    return {
      mtbfHours: this.mtbfHours(failures, operatingWindowMs),
      mttrMinutes: this.mttrMinutes(failures),
      availability,
      nines: this.toNines(availability),
      tier: this.toTier(availability),
    };
  }
}
