/**
 * SINT Protocol — Forbidden Tool Combination Detection.
 *
 * Detects dangerous sequences of actions that indicate
 * capability laundering or attack escalation.
 *
 * @module @sint/gate-policy-gateway/forbidden-combos
 */

import {
  type ApprovalTier,
  DEFAULT_FORBIDDEN_COMBOS,
  type ForbiddenCombination,
} from "@sint-ai/core";

/** Result of a forbidden combo check. */
export interface ComboCheckResult {
  readonly triggered: boolean;
  readonly matchedCombo?: ForbiddenCombination;
  readonly requiredTier?: ApprovalTier;
}

/**
 * Check if the recent action sequence matches any forbidden combination.
 *
 * Uses a sliding window approach — checks if any forbidden sequence
 * appears in the recent actions within the specified time window.
 *
 * @param recentActions - The agent's recent actions (most recent last)
 * @param currentAction - The action being requested now
 * @param combos - Forbidden combinations to check against
 * @returns Whether a forbidden combo was detected
 *
 * @example
 * ```ts
 * const result = checkForbiddenCombos(
 *   ["filesystem.write"],
 *   "exec.run",
 * );
 * if (result.triggered) {
 *   console.log("Blocked:", result.matchedCombo.reason);
 * }
 * ```
 */
export function checkForbiddenCombos(
  recentActions: readonly string[],
  currentAction: string,
  combos: readonly ForbiddenCombination[] = DEFAULT_FORBIDDEN_COMBOS,
): ComboCheckResult {
  // Build the full action sequence including the current action
  const fullSequence = [...recentActions, currentAction];

  for (const combo of combos) {
    if (isSubsequenceMatch(fullSequence, combo.sequence)) {
      return {
        triggered: true,
        matchedCombo: combo,
        requiredTier: combo.requiredTier,
      };
    }
  }

  return { triggered: false };
}

/**
 * Check if the forbidden sequence appears as a subsequence
 * in the recent actions. The forbidden sequence elements
 * must appear in order, but not necessarily consecutively.
 */
function isSubsequenceMatch(
  actions: readonly string[],
  forbidden: readonly string[],
): boolean {
  let fi = 0; // Index into forbidden sequence

  for (const action of actions) {
    if (fi < forbidden.length && matchesAction(action, forbidden[fi]!)) {
      fi++;
    }
  }

  return fi === forbidden.length;
}

/**
 * Match an action against a pattern.
 * Supports exact match and dot-prefix matching.
 */
function matchesAction(action: string, pattern: string): boolean {
  if (action === pattern) return true;

  // Support prefix matching: "ros2.cmd_vel" matches "ros2.cmd_vel.publish"
  if (action.startsWith(pattern + ".")) return true;

  return false;
}
