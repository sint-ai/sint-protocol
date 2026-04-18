/**
 * SINT Protocol — System 1 / System 2 Arbitrator.
 *
 * THE CRITICAL INVARIANT: System 2 ALWAYS wins on safety.
 *
 * When System 1 (neural) and System 2 (symbolic) disagree on a
 * safety-relevant action, System 2's decision is final. This
 * invariant is the foundation of SINT's physical AI safety model.
 *
 * @module @sint/engine-system2/arbitration/arbitrator
 */

import type {
  SintActionRecommendation,
  SintArbitrationDecision,
  SintWorldState,
} from "@sint-ai/core";

/** Event emitted by the arbitrator. */
export interface ArbitratorEvent {
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
}

/**
 * Generates an ISO 8601 timestamp with microsecond precision.
 */
function nowISO(): string {
  return new Date().toISOString().replace("Z", "000Z");
}

/**
 * Arbitrates between System 1 and System 2 action recommendations.
 *
 * CRITICAL INVARIANT: System 2 ALWAYS wins when safety is involved.
 * This class enforces the fundamental safety contract of the SINT Protocol.
 *
 * Decision rules:
 * 1. If EITHER recommendation is safety-relevant AND they disagree:
 *    System 2 ALWAYS wins.
 * 2. If both agree: use the one with higher confidence.
 * 3. If neither is safety-relevant: use the one with higher confidence
 *    (System 1 may win here).
 *
 * @example
 * ```ts
 * const arbitrator = new Arbitrator();
 * const decision = arbitrator.arbitrate(s1Rec, s2Rec, worldState);
 * // decision.winner is "system1" or "system2"
 * // decision.isSafetyOverride is true if S2 overrode S1 on safety
 * ```
 */
export class Arbitrator {
  private readonly _onEvent?: (event: ArbitratorEvent) => void;

  constructor(onEvent?: (event: ArbitratorEvent) => void) {
    this._onEvent = onEvent;
  }

  /**
   * Arbitrate between System 1 and System 2 recommendations.
   *
   * @param s1 - System 1 (neural) recommendation.
   * @param s2 - System 2 (symbolic) recommendation.
   * @param _worldState - Current fused world state.
   * @returns An arbitration decision with winner and rationale.
   *
   * @example
   * ```ts
   * const decision = arbitrator.arbitrate(s1, s2, worldState);
   * ```
   */
  arbitrate(
    s1: SintActionRecommendation,
    s2: SintActionRecommendation,
    _worldState: SintWorldState,
  ): SintArbitrationDecision {
    const eitherSafetyRelevant = s1.isSafetyRelevant || s2.isSafetyRelevant;
    const theyDisagree =
      s1.action !== s2.action || s1.resource !== s2.resource;

    // CRITICAL INVARIANT: System 2 ALWAYS wins on safety
    if (eitherSafetyRelevant && theyDisagree) {
      const decision: SintArbitrationDecision = {
        s1Recommendation: s1,
        s2Recommendation: s2,
        winner: "system2",
        reason:
          "Safety-relevant disagreement: System 2 (symbolic) overrides System 1 (neural)",
        isSafetyOverride: true,
        decidedAt: nowISO(),
      };

      this._onEvent?.({
        eventType: "engine.arbitration.override",
        payload: {
          winner: decision.winner,
          reason: decision.reason,
          s1Action: s1.action,
          s1Resource: s1.resource,
          s2Action: s2.action,
          s2Resource: s2.resource,
        },
      });

      return decision;
    }

    // Safety-relevant but they agree — System 2 wins (safety authority)
    if (eitherSafetyRelevant && !theyDisagree) {
      const decision: SintArbitrationDecision = {
        s1Recommendation: s1,
        s2Recommendation: s2,
        winner: "system2",
        reason:
          "Both systems agree on safety-relevant action; System 2 retains authority",
        isSafetyOverride: false,
        decidedAt: nowISO(),
      };

      this._onEvent?.({
        eventType: "engine.arbitration.decided",
        payload: {
          winner: decision.winner,
          reason: decision.reason,
          action: s2.action,
          resource: s2.resource,
        },
      });

      return decision;
    }

    // Not safety-relevant — higher confidence wins
    const winner = s1.confidence >= s2.confidence ? "system1" : "system2";
    const winnerRec = winner === "system1" ? s1 : s2;

    const decision: SintArbitrationDecision = {
      s1Recommendation: s1,
      s2Recommendation: s2,
      winner,
      reason: `Non-safety action: ${winner} wins with confidence ${winnerRec.confidence}`,
      isSafetyOverride: false,
      decidedAt: nowISO(),
    };

    this._onEvent?.({
      eventType: "engine.arbitration.decided",
      payload: {
        winner: decision.winner,
        reason: decision.reason,
        action: winnerRec.action,
        resource: winnerRec.resource,
        confidence: winnerRec.confidence,
      },
    });

    return decision;
  }
}
