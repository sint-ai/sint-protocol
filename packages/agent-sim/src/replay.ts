import type { DecisionTrace, Divergence, SimulationResult } from './types.js';

/** A function the simulator can call to re-evaluate an observation. */
export type AgentFn = (observation: Record<string, unknown>) => Promise<{ action: Record<string, unknown>; latencyMs?: number }>;

/**
 * Replays a recorded decision trace against a (possibly updated) agent function
 * and reports where the new agent's actions diverge from the historical actions.
 */
export class ReplayHarness {
  static async replay(trace: DecisionTrace[], agent: AgentFn): Promise<SimulationResult> {
    const divergences: Divergence[] = [];
    let latencySum = 0;
    let rewardSum = 0;

    for (let i = 0; i < trace.length; i++) {
      const original = trace[i];
      if (!original) continue;
      const result = await agent(original.observation);
      latencySum += result.latencyMs ?? original.latencyMs;
      rewardSum += original.reward ?? 0;

      if (!this.actionsEqual(result.action, original.action)) {
        divergences.push({
          decisionIndex: i,
          expected: original.action,
          actual: result.action,
          severity: this.classifyDivergence(original.action, result.action),
        });
      }
    }

    return {
      totalDecisions: trace.length,
      divergences,
      adversarialFaults: 0,
      meanLatencyMs: trace.length > 0 ? latencySum / trace.length : 0,
      rewardSum,
    };
  }

  private static actionsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
    const ak = Object.keys(a).sort();
    const bk = Object.keys(b).sort();
    if (ak.length !== bk.length) return false;
    return ak.every((k, i) => k === bk[i] && JSON.stringify(a[k]) === JSON.stringify(b[k]));
  }

  private static classifyDivergence(
    expected: Record<string, unknown>,
    actual: Record<string, unknown>,
  ): Divergence['severity'] {
    const majorKeys = ['type', 'decision', 'action'];
    for (const k of majorKeys) {
      if (k in expected && k in actual && expected[k] !== actual[k]) return 'major';
    }
    return 'minor';
  }
}
