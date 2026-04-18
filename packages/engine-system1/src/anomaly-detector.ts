/**
 * SINT Protocol — Anomaly Detector for System 1 perception.
 *
 * Detects anomalies in the fused world state using statistical analysis:
 * - Low confidence: objects below the confidence threshold
 * - Distribution shift: confidence values deviating from running statistics
 *   (Welford's online algorithm for mean/variance)
 * - Collision risk: objects within 0.5m of robot pose
 * - Human presence: flags when humans are detected
 *
 * @module @sint/engine-system1/anomaly-detector
 */

import type { SintAnomalyFlag, SintWorldState, Point3D } from "@sint-ai/core";
import type { AnomalyConfig } from "./types.js";
import { DEFAULT_ANOMALY_CONFIG } from "./types.js";

/**
 * Running statistics using Welford's online algorithm.
 */
interface RunningStats {
  count: number;
  mean: number;
  m2: number;
}

/** Distance threshold in meters for collision risk detection. */
const COLLISION_DISTANCE_THRESHOLD = 0.5;

/**
 * Detects anomalies in world state snapshots using statistical methods.
 *
 * Maintains running statistics (Welford's algorithm) over object confidence
 * values to detect distribution shifts. Also checks for low-confidence
 * detections, collision risks, and unexpected human presence.
 *
 * @example
 * ```ts
 * const detector = new AnomalyDetector({ confidenceThreshold: 0.6 });
 * const flags = detector.analyze(worldState);
 * if (flags.length > 0) {
 *   console.log("Anomalies detected:", flags.map(f => f.type));
 * }
 * ```
 */
export class AnomalyDetector {
  private readonly config: AnomalyConfig;
  private stats: RunningStats;

  /**
   * Create an anomaly detector with optional configuration overrides.
   *
   * @param config - Partial anomaly configuration (defaults are merged)
   *
   * @example
   * ```ts
   * const detector = new AnomalyDetector({ distributionShiftSigma: 2.0 });
   * ```
   */
  constructor(config?: Partial<AnomalyConfig>) {
    this.config = { ...DEFAULT_ANOMALY_CONFIG, ...config };
    this.stats = { count: 0, mean: 0, m2: 0 };
  }

  /**
   * Analyze a world state for anomalies.
   *
   * Checks each object for:
   * 1. Low confidence (below configurable threshold)
   * 2. Distribution shift (deviation from running mean by > N sigma)
   * 3. Collision risk (Euclidean distance to robot < 0.5m)
   * 4. Human detection (informational flag)
   *
   * @param worldState - The fused world state to analyze
   * @returns Array of anomaly flags (empty if no anomalies)
   *
   * @example
   * ```ts
   * const flags = detector.analyze(worldState);
   * for (const flag of flags) {
   *   console.log(`[${flag.type}] severity=${flag.severity}: ${flag.message}`);
   * }
   * ```
   */
  analyze(worldState: SintWorldState): SintAnomalyFlag[] {
    const flags: SintAnomalyFlag[] = [];

    for (const obj of worldState.objects) {
      // Update running statistics with this confidence value
      this.updateStats(obj.confidence);

      // Check 1: Low confidence
      if (obj.confidence < this.config.confidenceThreshold) {
        flags.push({
          type: "low_confidence",
          severity: 1.0 - obj.confidence,
          source: "anomaly_detector",
          message: `Object "${obj.classLabel}" has low confidence: ${obj.confidence.toFixed(3)}`,
        });
      }

      // Check 2: Distribution shift
      const stddev = this.getStddev();
      if (this.stats.count >= 3 && stddev > 0) {
        const zScore = Math.abs(obj.confidence - this.stats.mean) / stddev;
        if (zScore > this.config.distributionShiftSigma) {
          flags.push({
            type: "distribution_shift",
            severity: Math.min(1.0, zScore / (this.config.distributionShiftSigma * 2)),
            source: "anomaly_detector",
            message: `Object "${obj.classLabel}" confidence deviates ${zScore.toFixed(2)} sigma from mean`,
          });
        }
      }

      // Check 3: Collision risk — distance from object center to robot position
      const objectCenter = computeCenter(obj.boundingBox3D.min, obj.boundingBox3D.max);
      const distance = euclideanDistance(objectCenter, worldState.robotPose.position);
      if (distance < COLLISION_DISTANCE_THRESHOLD) {
        const severity = 1.0 - distance / COLLISION_DISTANCE_THRESHOLD;
        flags.push({
          type: "collision_risk",
          severity: Math.max(0, Math.min(1.0, severity)),
          source: "anomaly_detector",
          message: `Object "${obj.classLabel}" is ${distance.toFixed(3)}m from robot (threshold: ${COLLISION_DISTANCE_THRESHOLD}m)`,
        });
      }

      // Check 4: Human detected
      if (obj.isHuman) {
        flags.push({
          type: "novelty",
          severity: 0.5,
          source: "anomaly_detector",
          message: `Human detected: "${obj.classLabel}" at distance ${distance.toFixed(3)}m`,
        });
      }
    }

    return flags;
  }

  /**
   * Reset running statistics. Clears the mean, variance, and sample count.
   *
   * @example
   * ```ts
   * detector.reset();
   * ```
   */
  reset(): void {
    this.stats = { count: 0, mean: 0, m2: 0 };
  }

  /**
   * Update Welford's online running statistics with a new value.
   */
  private updateStats(value: number): void {
    this.stats.count += 1;
    const delta = value - this.stats.mean;
    this.stats.mean += delta / this.stats.count;
    const delta2 = value - this.stats.mean;
    this.stats.m2 += delta * delta2;
  }

  /**
   * Compute the sample standard deviation from running statistics.
   */
  private getStddev(): number {
    if (this.stats.count < 2) {
      return 0;
    }
    return Math.sqrt(this.stats.m2 / (this.stats.count - 1));
  }
}

/**
 * Compute the center point of a 3D bounding box.
 */
function computeCenter(min: Point3D, max: Point3D): Point3D {
  return {
    x: (min.x + max.x) / 2,
    y: (min.y + max.y) / 2,
    z: (min.z + max.z) / 2,
  };
}

/**
 * Compute Euclidean distance between two 3D points.
 */
function euclideanDistance(a: Point3D, b: Point3D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
