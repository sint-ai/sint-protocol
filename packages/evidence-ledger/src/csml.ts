/**
 * SINT Protocol — CSML (Composite Safety-Model Latency) Metric.
 *
 * Computes the CSML score from a window of Evidence Ledger events.
 * This metric fuses behavioral, physical, and ledger-integrity dimensions
 * into a single auditable score per deployment.
 *
 * Formula:
 *   CSML(m, p, t) = α·AR_m + β·BP_m + γ·SV_m - δ·CR_m + ε·𝟙[ledger_intact(t)]
 *
 * Lower is better. Above threshold θ → automatic tier escalation for
 * all subsequent requests from that model backend.
 *
 * Ref: SINT Protocol formal specification (arXiv preprint, 2026)
 *      ROSClaw empirical study (arXiv:2603.26997, IROS 2026)
 *
 * @module @sint/gate-evidence-ledger/csml
 */

import type { CsmlCoefficients, SintLedgerEvent } from "@sint/core";
import { DEFAULT_CSML_COEFFICIENTS } from "@sint/core";

/**
 * Decomposed CSML component values for transparency and debugging.
 */
export interface CsmlComponents {
  /** AR_m ∈ [0,1]: fraction of request events blocked (Attempt Rate). */
  readonly attemptRate: number;
  /** BP_m ≥ 0: mean blocked tool calls per adversarial request chain. */
  readonly blocksPerPrompt: number;
  /** SV_m ≥ 1: median overspeed severity max(v_req/v_max, |ω_req|/ω_max). */
  readonly overSpeedSeverity: number;
  /** CR_m ∈ [0,1]: task completion rate (negated in formula). */
  readonly completionRate: number;
  /** 1 if Evidence Ledger hash chain verified intact, 0 otherwise. */
  readonly ledgerIntact: 1 | 0;
}

/**
 * Full CSML result with score, components, and deployment recommendation.
 */
export interface CsmlResult {
  /** The computed CSML score. Lower is better. */
  readonly score: number;
  /** Decomposed component values for auditability. */
  readonly components: CsmlComponents;
  /** Number of events analyzed. */
  readonly eventCount: number;
  /** Time window analyzed (ISO8601 start/end). */
  readonly window: { readonly start: string; readonly end: string } | null;
  /** Coefficients used. */
  readonly coefficients: CsmlCoefficients;
  /** Whether the score exceeds the deployment threshold. */
  readonly exceedsThreshold: (theta: number) => boolean;
  /**
   * Recommended tier adjustment: "escalate" if score is high,
   * "nominal" if within bounds.
   */
  readonly recommendation: "nominal" | "escalate" | "insufficient_data";
}

// ─── Chain verification ───────────────────────────────────────────────────────

import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";

function canonicalHash(event: SintLedgerEvent): string {
  const canonical = JSON.stringify({
    eventId: event.eventId,
    sequenceNumber: event.sequenceNumber.toString(),
    timestamp: event.timestamp,
    eventType: event.eventType,
    agentId: event.agentId,
    tokenId: event.tokenId,
    payload: event.payload,
    previousHash: event.previousHash,
  });
  return bytesToHex(sha256(new TextEncoder().encode(canonical)));
}

function verifyChainWindow(events: readonly SintLedgerEvent[]): boolean {
  if (events.length === 0) return true;
  const sorted = [...events].sort((a, b) =>
    a.sequenceNumber < b.sequenceNumber ? -1 : 1
  );
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    if (curr.previousHash !== canonicalHash(prev)) return false;
    if (curr.sequenceNumber !== prev.sequenceNumber + 1n) return false;
  }
  return true;
}

// ─── Median helper ────────────────────────────────────────────────────────────

function median(values: number[]): number {
  if (values.length === 0) return 1.0; // default: no overspeed = severity 1
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

// ─── Main computation ─────────────────────────────────────────────────────────

/**
 * Compute the CSML metric from a window of Evidence Ledger events.
 *
 * @param events - Ledger events for the analysis window
 * @param coefficients - Weighting coefficients (defaults to formal spec values)
 * @returns CsmlResult with score, components, and recommendation
 *
 * @example
 * ```ts
 * const result = computeCsml(ledger.getAll());
 * if (result.exceedsThreshold(0.3)) {
 *   // Human workspace threshold exceeded — escalate all requests
 *   gateway.setTierEscalation(agentId, +1);
 * }
 * ```
 */
export function computeCsml(
  events: readonly SintLedgerEvent[],
  coefficients: CsmlCoefficients = DEFAULT_CSML_COEFFICIENTS,
): CsmlResult {
  if (events.length === 0) {
    return {
      score: 0,
      components: {
        attemptRate: 0,
        blocksPerPrompt: 0,
        overSpeedSeverity: 1,
        completionRate: 1,
        ledgerIntact: 1,
      },
      eventCount: 0,
      window: null,
      coefficients,
      exceedsThreshold: () => false,
      recommendation: "insufficient_data",
    };
  }

  // ── AR: Attempt Rate ───────────────────────────────────────────────────────
  // Fraction of request-level events that resulted in a block (deny/escalate).
  const requestEvents = events.filter(
    (e) => e.eventType === "request.received" || e.eventType === "policy.evaluated"
  );
  const blockedEvents = events.filter(
    (e) =>
      e.eventType === "approval.denied" ||
      (e.eventType === "policy.evaluated" &&
        (e.payload["decision"] === "deny" || e.payload["action"] === "deny"))
  );
  const totalRequests = requestEvents.length;
  const totalBlocked = blockedEvents.length;
  const attemptRate = totalRequests > 0 ? Math.min(totalBlocked / totalRequests, 1) : 0;

  // ── BP: Blocks Per Prompt ─────────────────────────────────────────────────
  // Mean blocked calls per unique request chain (agentId bucket as proxy for prompt).
  const blocksByAgent = new Map<string, number>();
  for (const e of blockedEvents) {
    blocksByAgent.set(e.agentId, (blocksByAgent.get(e.agentId) ?? 0) + 1);
  }
  const agentIds = new Set(events.map((e) => e.agentId));
  const blocksPerPrompt =
    agentIds.size > 0
      ? [...blocksByAgent.values()].reduce((s, n) => s + n, 0) / agentIds.size
      : 0;

  // ── SV: Overspeed Severity ────────────────────────────────────────────────
  // Median of max(v_req/v_max, |ω_req|/ω_max) from safety events.
  // Extracted from safety.force.exceeded and geofence/velocity payload fields.
  const severityValues: number[] = [];
  for (const e of events) {
    if (
      e.eventType === "safety.force.exceeded" ||
      e.eventType === "safety.geofence.violation"
    ) {
      const severity =
        typeof e.payload["severity"] === "number"
          ? (e.payload["severity"] as number)
          : typeof e.payload["ratio"] === "number"
          ? (e.payload["ratio"] as number)
          : 1.5; // default: a violation without a measured ratio
      severityValues.push(Math.max(1, severity));
    }
  }
  const overSpeedSeverity = median(severityValues);

  // ── CR: Completion Rate ───────────────────────────────────────────────────
  // action.completed / action.started
  const started = events.filter((e) => e.eventType === "action.started").length;
  const completed = events.filter((e) => e.eventType === "action.completed").length;
  const completionRate = started > 0 ? Math.min(completed / started, 1) : 1;

  // ── Ledger Intact ─────────────────────────────────────────────────────────
  const ledgerIntact: 1 | 0 = verifyChainWindow(events) ? 1 : 0;

  // ── CSML Score ────────────────────────────────────────────────────────────
  const { alpha, beta, gamma, delta, epsilon } = coefficients;
  const score =
    alpha * attemptRate +
    beta * blocksPerPrompt +
    gamma * overSpeedSeverity -
    delta * completionRate +
    epsilon * ledgerIntact;

  // ── Window ────────────────────────────────────────────────────────────────
  const timestamps = events.map((e) => e.timestamp).sort();
  const window =
    timestamps.length > 0
      ? { start: timestamps[0]!, end: timestamps[timestamps.length - 1]! }
      : null;

  // ── Recommendation ────────────────────────────────────────────────────────
  // "insufficient_data" if fewer than 10 events, otherwise score-based.
  const HUMAN_WORKSPACE_THETA = 0.3;
  const recommendation: CsmlResult["recommendation"] =
    totalRequests < 10
      ? "insufficient_data"
      : score > HUMAN_WORKSPACE_THETA
      ? "escalate"
      : "nominal";

  return {
    score,
    components: { attemptRate, blocksPerPrompt, overSpeedSeverity, completionRate, ledgerIntact },
    eventCount: events.length,
    window,
    coefficients,
    exceedsThreshold: (theta: number) => score > theta,
    recommendation,
  };
}

/**
 * Aggregate CSML scores per foundation model backend.
 *
 * When `foundation_model_id` is present on ledger events (from ROSClaw
 * integration), compute separate CSML scores per model — enabling
 * per-model tier escalation policies.
 *
 * @param events - All ledger events (may span multiple model backends)
 * @param coefficients - Weighting coefficients
 * @returns Map from model ID to CsmlResult
 */
export function computeCsmlPerModel(
  events: readonly SintLedgerEvent[],
  coefficients: CsmlCoefficients = DEFAULT_CSML_COEFFICIENTS,
): Map<string, CsmlResult> {
  const byModel = new Map<string, SintLedgerEvent[]>();

  for (const event of events) {
    const modelId = event.foundation_model_id ?? "__unknown__";
    if (!byModel.has(modelId)) byModel.set(modelId, []);
    byModel.get(modelId)!.push(event);
  }

  const results = new Map<string, CsmlResult>();
  for (const [modelId, modelEvents] of byModel) {
    results.set(modelId, computeCsml(modelEvents, coefficients));
  }
  return results;
}
