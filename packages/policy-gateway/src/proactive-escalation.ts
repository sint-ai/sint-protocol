/**
 * SINT Protocol — Proactive CSML Escalation Engine.
 *
 * Monitors the Evidence Ledger for CSML score drift and emits
 * operator notifications when an agent's safety score exceeds the
 * human-workspace threshold (θ = 0.3).
 *
 * Usage: call `engine.evaluate(agentId)` after each policy decision,
 * or `engine.evaluateAll()` on a timer. Emits EscalationAlert objects
 * via the `onAlert` callback when the score crosses the threshold.
 *
 * This class implements CsmlEscalationPlugin so it can be plugged
 * directly into PolicyGateway.
 *
 * @module @sint/gate-policy-gateway/proactive-escalation
 */

import type { ApprovalTier, SintLedgerEvent } from "@pshkv/core";
import { computeCsml } from "@pshkv/gate-evidence-ledger";

export interface EscalationAlert {
  readonly agentId: string;
  readonly csmlScore: number;
  readonly threshold: number;
  readonly recommendation: "escalate" | "nominal" | "insufficient_data";
  readonly previousTier: ApprovalTier;
  readonly escalatedTier: ApprovalTier;
  readonly reason: string;
  readonly timestamp: string;
  /** Number of events analyzed in the window. */
  readonly eventCount: number;
}

export interface EventSource {
  /** Return all events for a given agentId. */
  getEventsForAgent(agentId: string): readonly SintLedgerEvent[];
}

export interface ProactiveEscalationEngineOptions {
  /** CSML threshold above which to escalate. Default: 0.3 (human workspace). */
  threshold?: number;
  /** Minimum seconds between repeated alerts for the same agent. Default: 60. */
  alertCooldownSeconds?: number;
  /** Called whenever an alert is emitted. */
  onAlert?: (alert: EscalationAlert) => void | Promise<void>;
}

export class ProactiveEscalationEngine {
  private readonly threshold: number;
  private readonly alertCooldownMs: number;
  private readonly onAlert?: (alert: EscalationAlert) => void | Promise<void>;
  /** Timestamp of last alert per agentId. */
  private readonly lastAlertAt = new Map<string, number>();

  constructor(
    private readonly eventSource: EventSource,
    opts: ProactiveEscalationEngineOptions = {},
  ) {
    this.threshold = opts.threshold ?? 0.3;
    this.alertCooldownMs = (opts.alertCooldownSeconds ?? 60) * 1_000;
    this.onAlert = opts.onAlert;
  }

  /**
   * Evaluate a single agent's CSML score.
   * Returns an EscalationAlert if threshold crossed and cooldown passed, or null.
   */
  async evaluate(agentId: string, currentTier: ApprovalTier): Promise<EscalationAlert | null> {
    const events = this.eventSource.getEventsForAgent(agentId);
    const result = computeCsml(events);

    if (result.recommendation === "insufficient_data") {
      return null;
    }

    if (!result.exceedsThreshold(this.threshold)) {
      return null;
    }

    // Check cooldown
    const lastAlert = this.lastAlertAt.get(agentId) ?? 0;
    const now = Date.now();
    if (now - lastAlert < this.alertCooldownMs) {
      return null; // still in cooldown
    }

    const escalatedTier = this.escalateTier(currentTier);
    const alert: EscalationAlert = {
      agentId,
      csmlScore: result.score,
      threshold: this.threshold,
      recommendation: result.recommendation,
      previousTier: currentTier,
      escalatedTier,
      reason: `CSML score ${result.score.toFixed(3)} exceeds threshold ${this.threshold} over ${result.eventCount} events (AR=${result.components.attemptRate.toFixed(2)}, BP=${result.components.blocksPerPrompt.toFixed(2)})`,
      timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
      eventCount: result.eventCount,
    };

    this.lastAlertAt.set(agentId, now);

    if (this.onAlert) {
      await this.onAlert(alert);
    }

    return alert;
  }

  /**
   * Implements CsmlEscalationPlugin.evaluateAgent() — called by PolicyGateway
   * after tier assignment.
   */
  async evaluateAgent(
    agentId: string,
    assignedTier: ApprovalTier,
  ): Promise<{ escalated: boolean; resultTier: ApprovalTier; csmlScore: number | null; reason: string }> {
    const alert = await this.evaluate(agentId, assignedTier);
    if (!alert) {
      return { escalated: false, resultTier: assignedTier, csmlScore: null, reason: "CSML nominal or insufficient data" };
    }
    return {
      escalated: true,
      resultTier: alert.escalatedTier,
      csmlScore: alert.csmlScore,
      reason: alert.reason,
    };
  }

  /** Evaluate all agents that appear in the event source. */
  async evaluateAll(agentTiers: Map<string, ApprovalTier>): Promise<EscalationAlert[]> {
    const alerts: EscalationAlert[] = [];
    for (const [agentId, tier] of agentTiers) {
      const alert = await this.evaluate(agentId, tier);
      if (alert) alerts.push(alert);
    }
    return alerts;
  }

  /** Clear cooldown state for a specific agent (useful for testing). */
  clearCooldown(agentId: string): void {
    this.lastAlertAt.delete(agentId);
  }

  private escalateTier(tier: ApprovalTier): ApprovalTier {
    // Tier escalation: T0 → T1 → T2 → T3 (cap at T3)
    const escalationMap: Record<string, ApprovalTier> = {
      T0_observe: "T1_prepare" as ApprovalTier,
      T1_prepare: "T2_act" as ApprovalTier,
      T2_act: "T3_commit" as ApprovalTier,
      T3_commit: "T3_commit" as ApprovalTier,
    };
    return escalationMap[tier] ?? ("T2_act" as ApprovalTier);
  }
}
