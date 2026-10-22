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
  normalizeComboAction,
} from "@pshkv/core";

/** Timestamp supplied by the gateway clock, not the request timestamp. */
export interface TimedComboAction {
  readonly action: string;
  readonly timestampMs: number;
}

/** Result of a forbidden combo check. */
export interface ComboCheckResult {
  readonly triggered: boolean;
  readonly matchedCombo?: ForbiddenCombination;
  readonly requiredTier?: ApprovalTier;
}

/**
 * Check if the recent action sequence matches any forbidden combination.
 *
 * Timestamped events honor each combination window. Legacy strings have unknown
 * age and are conservatively treated as current; they can only raise risk.
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
  recentActions: readonly (string | TimedComboAction)[],
  currentAction: string,
  combos: readonly ForbiddenCombination[] = DEFAULT_FORBIDDEN_COMBOS,
  nowMs: number = Date.now(),
): ComboCheckResult {
  const current = normalizeComboAction(currentAction);
  for (const combo of combos) {
    const sequence = combo.sequence.map(action => normalizeComboAction(action));
    const last = sequence.at(-1);
    // Only a sequence completed by this request can trigger a new escalation.
    if (!last || !matchesAction(current, last)) continue;
    const history = recentActions.filter(event => typeof event === "string"
      || (event.timestampMs <= nowMs && nowMs - event.timestampMs <= combo.windowMs))
      .map(event => normalizeComboAction(typeof event === "string" ? event : event.action));
    if (isSubsequenceMatch(history, sequence.slice(0, -1))) {
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
