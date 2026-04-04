/**
 * SINT Protocol — Safety Classifier.
 *
 * Pure function that classifies whether an action recommendation
 * is safety-relevant based on resource patterns, flags, and confidence.
 *
 * @module @sint/engine-system2/arbitration/safety-classifier
 */

import type { SintActionRecommendation } from "@sint/core";

/** Result of a safety classification. */
export interface SafetyClassification {
  /** Whether the action is considered safe. */
  readonly isSafe: boolean;
  /** Human-readable reason for the classification. */
  readonly reason: string;
}

/** Resource URI patterns that are always safety-relevant. */
const SAFETY_RELEVANT_PATTERNS: readonly RegExp[] = [
  /^ros2:\/\/\/cmd_vel/,
  /^ros2:\/\/\/gripper\//,
  /^ros2:\/\/\/gripper$/,
  /^ros2:\/\/\/joint_commands/,
];

/** Minimum confidence threshold below which actions are considered unsafe. */
const MIN_SAFE_CONFIDENCE = 0.5;

/**
 * Classify whether an action recommendation is safe.
 *
 * Checks three criteria:
 * 1. Resource pattern: actuator/motion resources are safety-relevant.
 * 2. isSafetyRelevant flag: explicit flag from the recommender.
 * 3. Confidence: below 0.5 is considered unsafe.
 *
 * @param recommendation - The action recommendation to classify.
 * @returns A classification with isSafe flag and reason string.
 *
 * @example
 * ```ts
 * const result = classifyActionSafety({
 *   action: "publish",
 *   resource: "ros2:///cmd_vel",
 *   params: {},
 *   confidence: 0.9,
 *   isSafetyRelevant: true,
 * });
 * // result.isSafe === false (safety-relevant resource)
 * ```
 */
export function classifyActionSafety(
  recommendation: SintActionRecommendation,
): SafetyClassification {
  // Check resource pattern
  for (const pattern of SAFETY_RELEVANT_PATTERNS) {
    if (pattern.test(recommendation.resource)) {
      return {
        isSafe: false,
        reason: `Resource "${recommendation.resource}" matches safety-relevant pattern`,
      };
    }
  }

  // Check explicit safety flag
  if (recommendation.isSafetyRelevant) {
    return {
      isSafe: false,
      reason: "Action is explicitly marked as safety-relevant",
    };
  }

  // Check confidence threshold
  if (recommendation.confidence < MIN_SAFE_CONFIDENCE) {
    return {
      isSafe: false,
      reason: `Confidence ${recommendation.confidence} is below minimum threshold ${MIN_SAFE_CONFIDENCE}`,
    };
  }

  return {
    isSafe: true,
    reason: "Action passes all safety checks",
  };
}
