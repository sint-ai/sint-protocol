/**
 * SINT Protocol — Cost-aware routing for Economic Layer v1.
 *
 * Scores candidate routes using estimated token cost, latency, and reliability.
 * Supports optional x402 pay-per-call quotes when available.
 *
 * @module @sint/bridge-economy/cost-aware-routing
 */

import type {
  CostAwareRoutingDecision,
  CostAwareRoutingInput,
  IX402Port,
  RouteCandidate,
} from "./interfaces.js";
import {
  computeActionCost,
  getBaseCost,
  GLOBAL_MARKUP_MULTIPLIER,
  TOKENS_PER_DOLLAR,
} from "./pricing-calculator.js";

interface CandidateEvaluation {
  readonly candidate: RouteCandidate;
  readonly totalCostTokens: number;
  readonly estimatedLatencyMs: number;
  readonly reliability: number;
  readonly score: number;
  readonly viaX402: boolean;
}

function estimateRouteTokens(
  candidate: RouteCandidate,
  requestParams: CostAwareRoutingInput["request"]["params"],
): {
  readonly costMultiplier: number;
  readonly viaX402: boolean;
} {
  if (candidate.x402?.enabled && typeof candidate.x402.quotedUsd === "number") {
    const tokens = Math.max(0, Math.ceil(candidate.x402.quotedUsd * TOKENS_PER_DOLLAR));
    const baseCost = getBaseCost({
      requestId: "route-planner",
      timestamp: new Date().toISOString(),
      agentId: "route-planner",
      tokenId: "route-planner",
      resource: candidate.resource,
      action: candidate.action,
      params: requestParams,
    });
    const divisor = Math.max(1, baseCost * GLOBAL_MARKUP_MULTIPLIER);
    return {
      costMultiplier: tokens / divisor,
      viaX402: true,
    };
  }

  return {
    costMultiplier: candidate.costMultiplier ?? 1.0,
    viaX402: false,
  };
}

function buildDecision(evaluation: CandidateEvaluation): CostAwareRoutingDecision {
  return {
    routeId: evaluation.candidate.routeId,
    totalCostTokens: evaluation.totalCostTokens,
    estimatedLatencyMs: evaluation.estimatedLatencyMs,
    score: evaluation.score,
    viaX402: evaluation.viaX402,
    reason: evaluation.viaX402
      ? "Selected by lowest composite score with x402 pay-per-call quote applied"
      : "Selected by lowest composite score (cost + latency - reliability)",
  };
}

/**
 * Select the best route using cost-aware scoring.
 */
export function selectCostAwareRoute(input: CostAwareRoutingInput): CostAwareRoutingDecision | undefined {
  if (input.candidates.length === 0) return undefined;

  const latencyWeight = input.latencyWeight ?? 0.02;
  const maxLatency = input.maxLatencyMs;

  const evaluations: CandidateEvaluation[] = [];

  for (const candidate of input.candidates) {
    const { costMultiplier, viaX402 } = estimateRouteTokens(candidate, input.request.params);
    const pricing = computeActionCost(
      {
        requestId: input.request.requestId,
        timestamp: new Date().toISOString(),
        agentId: "route-planner",
        tokenId: "route-planner",
        resource: candidate.resource,
        action: candidate.action,
        params: input.request.params,
      },
      costMultiplier,
    );

    const estimatedLatencyMs = Math.max(0, candidate.latencyMs ?? 0);
    const reliability = Math.min(1, Math.max(0, candidate.reliability ?? 0.5));

    if (maxLatency !== undefined && estimatedLatencyMs > maxLatency) {
      continue;
    }
    if (
      input.budgetRemainingTokens !== undefined
      && pricing.totalCost > input.budgetRemainingTokens
    ) {
      continue;
    }

    const score =
      pricing.totalCost
      + estimatedLatencyMs * latencyWeight
      - reliability * 2; // small preference for reliable routes

    evaluations.push({
      candidate,
      totalCostTokens: pricing.totalCost,
      estimatedLatencyMs,
      reliability,
      score,
      viaX402,
    });
  }

  if (evaluations.length === 0) return undefined;

  evaluations.sort((a, b) => a.score - b.score || a.totalCostTokens - b.totalCostTokens);
  return buildDecision(evaluations[0]!);
}

/**
 * Enrich route candidates with optional x402 quotes.
 */
export async function applyX402Quotes(
  candidates: readonly RouteCandidate[],
  x402Port?: IX402Port,
): Promise<RouteCandidate[]> {
  if (!x402Port) return [...candidates];

  const quoted: RouteCandidate[] = [];
  for (const candidate of candidates) {
    if (!candidate.x402?.enabled) {
      quoted.push(candidate);
      continue;
    }

    const result = await x402Port.getQuote(candidate);
    if (!result.ok) {
      quoted.push(candidate);
      continue;
    }

    quoted.push({
      ...candidate,
      x402: {
        ...candidate.x402,
        endpoint: result.value.endpoint,
        quotedUsd: result.value.priceUsd,
      },
    });
  }

  return quoted;
}
