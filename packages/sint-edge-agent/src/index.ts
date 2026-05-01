/**
 * Edge agent runtime: small, fast, deterministic.
 * Inspired by Applied Intuition's onboard model split — millisecond latency,
 * tight power budget, escalates to cloud only on uncertainty.
 */

export interface EdgeDecision {
  action: string;
  confidence: number;
  latencyMs: number;
  escalateToCloud: boolean;
  reason?: string;
}

export interface EdgePolicy {
  /** Lookup table: input hash → action. Tiny, fast, deterministic. */
  table: Map<string, { action: string; confidence: number }>;
  /** Below this confidence, escalate to the cloud agent. */
  escalationThreshold: number;
  /** Max latency budget in ms — agent must abort and escalate if exceeded. */
  latencyBudgetMs: number;
}

export class EdgeAgent {
  private policy: EdgePolicy;
  private callCount = 0;
  private escalationCount = 0;

  constructor(policy: EdgePolicy) {
    this.policy = policy;
  }

  /** Make a decision. If confidence too low, escalate flag is set. */
  decide(observation: Record<string, unknown>): EdgeDecision {
    const start = performance.now();
    this.callCount++;
    const key = this.hash(observation);
    const entry = this.policy.table.get(key);

    const latencyMs = performance.now() - start;

    if (!entry) {
      this.escalationCount++;
      return {
        action: 'noop',
        confidence: 0,
        latencyMs,
        escalateToCloud: true,
        reason: 'no_match_in_table',
      };
    }

    if (entry.confidence < this.policy.escalationThreshold) {
      this.escalationCount++;
      return {
        action: entry.action,
        confidence: entry.confidence,
        latencyMs,
        escalateToCloud: true,
        reason: 'low_confidence',
      };
    }

    if (latencyMs > this.policy.latencyBudgetMs) {
      this.escalationCount++;
      return {
        action: entry.action,
        confidence: entry.confidence,
        latencyMs,
        escalateToCloud: true,
        reason: 'latency_exceeded',
      };
    }

    return {
      action: entry.action,
      confidence: entry.confidence,
      latencyMs,
      escalateToCloud: false,
    };
  }

  /** Stats for telemetry. */
  stats() {
    return {
      callCount: this.callCount,
      escalationCount: this.escalationCount,
      escalationRate: this.callCount > 0 ? this.escalationCount / this.callCount : 0,
    };
  }

  /** Estimate footprint in bytes (rough). */
  footprintBytes(): number {
    let bytes = 0;
    for (const [k, v] of this.policy.table.entries()) {
      bytes += k.length * 2 + v.action.length * 2 + 8;
    }
    return bytes;
  }

  private hash(o: Record<string, unknown>): string {
    return JSON.stringify(o, Object.keys(o).sort());
  }
}
