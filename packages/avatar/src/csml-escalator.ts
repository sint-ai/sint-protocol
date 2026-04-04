/**
 * SINT Protocol — CSML Escalator.
 *
 * Implements the CSML-driven auto-escalation hook for PolicyGateway.
 * When an agent's Composite Safety-Model Latency score exceeds θ (default 0.3),
 * the assigned tier is bumped up by one level.
 *
 * Tier bump invariant: escalation is ADDITIVE and MONOTONIC.
 *   - Bumped tier = min(base + 1, T3_COMMIT)
 *   - Never reduces tier
 *   - T3_COMMIT stays T3_COMMIT (can't escalate past the ceiling)
 *
 * Integration: set as `csmlEscalation` on PolicyGatewayConfig. Called after
 * tier assignment (step 5), before forbidden combo check (step 6).
 *
 * @module @sint/avatar/csml-escalator
 */

import { ApprovalTier } from "@sint/core";
import { computeCsml } from "@sint/gate-evidence-ledger";
import { DEFAULT_CSML_COEFFICIENTS } from "@sint/core";
import type { CsmlCoefficients } from "@sint/core";
import type { AgentEventQuery, CsmlEscalationDecision } from "./types.js";
import { DEFAULT_CSML_THETA } from "./avatar-registry.js";

// ─── Tier ordering ─────────────────────────────────────────────────────────────

const TIER_ORDER = [
  ApprovalTier.T0_OBSERVE,
  ApprovalTier.T1_PREPARE,
  ApprovalTier.T2_ACT,
  ApprovalTier.T3_COMMIT,
] as const;

function bumpTier(tier: ApprovalTier, amount: 1 | 2 = 1): ApprovalTier {
  const idx = TIER_ORDER.indexOf(tier);
  const bumped = Math.min(idx + amount, TIER_ORDER.length - 1);
  return TIER_ORDER[bumped]!;
}

// ─── CsmlEscalator ────────────────────────────────────────────────────────────

/** Configuration for CsmlEscalator. */
export interface CsmlEscalatorConfig {
  /**
   * Fetch recent ledger events for an agent.
   * Typically: `(agentId, n) => ledger.queryByAgent(agentId, n)`
   */
  readonly queryEvents: AgentEventQuery;

  /**
   * CSML escalation threshold (default 0.3).
   * When csml.score > theta, tier is bumped.
   */
  readonly theta?: number;

  /**
   * Number of events to include in CSML window (default 200).
   * Larger windows are more stable; smaller windows react faster.
   */
  readonly windowSize?: number;

  /**
   * CSML coefficient overrides (default: DEFAULT_CSML_COEFFICIENTS).
   */
  readonly coefficients?: CsmlCoefficients;

  /**
   * Per-agent theta overrides. Agent IDs mapped to custom thresholds.
   * Useful for tightening constraints on known high-risk agents.
   */
  readonly agentThetaOverrides?: Readonly<Record<string, number>>;
}

/**
 * CSML-driven tier escalation hook.
 *
 * Queries recent ledger events for the acting agent, computes CSML,
 * and bumps the assigned tier by 1 if score > θ.
 *
 * @example
 * ```ts
 * const escalator = new CsmlEscalator({
 *   queryEvents: (agentId, n) => ledger.queryByAgent(agentId, n),
 *   theta: 0.3,
 * });
 *
 * const gateway = new PolicyGateway({
 *   resolveToken,
 *   csmlEscalation: escalator,
 * });
 * ```
 */
export class CsmlEscalator {
  private readonly queryEvents: AgentEventQuery;
  private readonly theta: number;
  private readonly windowSize: number;
  private readonly coefficients: CsmlCoefficients;
  private readonly agentThetaOverrides: Readonly<Record<string, number>>;

  constructor(config: CsmlEscalatorConfig) {
    this.queryEvents = config.queryEvents;
    this.theta = config.theta ?? DEFAULT_CSML_THETA;
    this.windowSize = config.windowSize ?? 200;
    this.coefficients = config.coefficients ?? DEFAULT_CSML_COEFFICIENTS;
    this.agentThetaOverrides = config.agentThetaOverrides ?? {};
  }

  /**
   * Evaluate whether this agent's CSML warrants tier escalation.
   *
   * Called by PolicyGateway after initial tier assignment.
   * Returns the (possibly bumped) tier and full escalation context.
   */
  async evaluateAgent(
    agentId: string,
    baseTier: ApprovalTier,
  ): Promise<CsmlEscalationDecision> {
    const agentTheta = this.agentThetaOverrides[agentId] ?? this.theta;

    let events: Awaited<ReturnType<AgentEventQuery>>;
    try {
      events = await this.queryEvents(agentId, this.windowSize);
    } catch {
      // Query failure → fail-open (no escalation, don't block the request)
      return {
        escalated: false,
        baseTier,
        resultTier: baseTier,
        csmlScore: null,
        reason: "CSML query failed — fail-open, no escalation applied",
      };
    }

    const result = computeCsml([...events], this.coefficients);

    if (result.recommendation === "insufficient_data") {
      return {
        escalated: false,
        baseTier,
        resultTier: baseTier,
        csmlScore: null,
        reason: "Insufficient data for CSML computation — no escalation",
      };
    }

    if (!result.exceedsThreshold(agentTheta)) {
      return {
        escalated: false,
        baseTier,
        resultTier: baseTier,
        csmlScore: result.score,
        reason: `CSML score ${result.score.toFixed(3)} ≤ θ=${agentTheta} — nominal`,
      };
    }

    const resultTier = bumpTier(baseTier);
    const alreadyAtCeiling = resultTier === baseTier; // T3 + bump still T3

    return {
      escalated: true,
      baseTier,
      resultTier,
      csmlScore: result.score,
      reason: alreadyAtCeiling
        ? `CSML score ${result.score.toFixed(3)} > θ=${agentTheta} — already at T3_COMMIT ceiling`
        : `CSML score ${result.score.toFixed(3)} > θ=${agentTheta} — tier bumped ${baseTier} → ${resultTier}`,
    };
  }
}
