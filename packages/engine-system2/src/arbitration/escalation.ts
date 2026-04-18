/**
 * SINT Protocol — Escalation Manager.
 *
 * Tracks persistent disagreements between System 1 and System 2
 * and escalates to human oversight when a threshold is exceeded.
 *
 * @module @sint/engine-system2/arbitration/escalation
 */

import type { SintArbitrationDecision } from "@sint-ai/core";

/** Event emitted by the escalation manager. */
export interface EscalationEvent {
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
}

/** Default window for counting disagreements (60 seconds). */
const DEFAULT_WINDOW_MS = 60_000;

/** Number of safety overrides within the window that triggers escalation. */
const ESCALATION_THRESHOLD = 3;

/**
 * Tracks safety overrides and determines when human escalation is needed.
 *
 * When 3 or more safety overrides occur within a 60-second window,
 * the escalation manager recommends involving a human operator.
 *
 * @example
 * ```ts
 * const manager = new EscalationManager();
 * manager.recordDisagreement(decision);
 * if (manager.shouldEscalateToHuman()) {
 *   // Alert human operator
 * }
 * ```
 */
export class EscalationManager {
  private readonly _onEvent?: (event: EscalationEvent) => void;
  private _overrideTimestamps: number[] = [];

  constructor(onEvent?: (event: EscalationEvent) => void) {
    this._onEvent = onEvent;
  }

  /**
   * Record an arbitration decision. Only safety overrides are tracked.
   *
   * @param decision - The arbitration decision to record.
   *
   * @example
   * ```ts
   * manager.recordDisagreement(decision);
   * ```
   */
  recordDisagreement(decision: SintArbitrationDecision): void {
    if (!decision.isSafetyOverride) {
      return;
    }

    this._overrideTimestamps.push(Date.now());

    if (this.shouldEscalateToHuman()) {
      this._onEvent?.({
        eventType: "engine.arbitration.escalated",
        payload: {
          overrideCount: this.getDisagreementCount(),
          windowMs: DEFAULT_WINDOW_MS,
          reason:
            "Too many safety overrides within time window — human review required",
        },
      });
    }
  }

  /**
   * Check if the disagreement rate warrants human escalation.
   *
   * @returns True if 3+ safety overrides occurred in the last 60 seconds.
   *
   * @example
   * ```ts
   * if (manager.shouldEscalateToHuman()) {
   *   notifyOperator();
   * }
   * ```
   */
  shouldEscalateToHuman(): boolean {
    return this.getDisagreementCount() >= ESCALATION_THRESHOLD;
  }

  /**
   * Get the number of safety overrides within a time window.
   *
   * @param windowMs - Time window in milliseconds. Defaults to 60000.
   * @returns Number of safety overrides within the window.
   *
   * @example
   * ```ts
   * const count = manager.getDisagreementCount(30_000); // last 30s
   * ```
   */
  getDisagreementCount(windowMs: number = DEFAULT_WINDOW_MS): number {
    const cutoff = Date.now() - windowMs;
    return this._overrideTimestamps.filter((ts) => ts >= cutoff).length;
  }

  /**
   * Reset all tracked disagreements.
   *
   * @example
   * ```ts
   * manager.reset();
   * ```
   */
  reset(): void {
    this._overrideTimestamps = [];
  }
}
