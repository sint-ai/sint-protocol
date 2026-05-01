/**
 * sim-real-matcher: feeds production telemetry back into simulator parameters.
 *
 * Mirrors Applied Intuition's "heating profile" lesson: the sim must capture
 * latent constraints (latency, cost, MCP failures) for the policy to be safe
 * in real-world execution.
 */

export interface SimParameters {
  /** Mean MCP latency in ms */
  meanLatencyMs: number;
  /** P99 latency in ms */
  p99LatencyMs: number;
  /** MCP failure rate (0-1) */
  failureRate: number;
  /** Cost per MCP call in fractional cents */
  costPerCall: number;
  /** Custom parameters (e.g., thermal limits) */
  custom: Record<string, number>;
}

export interface RealTelemetry {
  latenciesMs: number[];
  failures: number;
  totalCalls: number;
  totalCostCents: number;
  customMetrics?: Record<string, number>;
}

export interface MatchResult {
  iteration: number;
  parameters: SimParameters;
  divergencePercent: number;
  converged: boolean;
}

export class SimRealMatcher {
  /** Convergence threshold in percent. Below this we declare match. */
  static readonly CONVERGENCE_THRESHOLD = 5.0;

  /** Compute divergence percentage between sim parameters and real telemetry. */
  static divergence(sim: SimParameters, real: RealTelemetry): number {
    const realMean = this.mean(real.latenciesMs);
    const realP99 = this.percentile(real.latenciesMs, 99);
    const realFailRate = real.totalCalls > 0 ? real.failures / real.totalCalls : 0;
    const realCost = real.totalCalls > 0 ? real.totalCostCents / real.totalCalls : 0;

    const meanDiv = this.pctDiff(sim.meanLatencyMs, realMean);
    const p99Div = this.pctDiff(sim.p99LatencyMs, realP99);
    const failDiv = this.pctDiff(sim.failureRate, realFailRate);
    const costDiv = this.pctDiff(sim.costPerCall, realCost);

    return (meanDiv + p99Div + failDiv + costDiv) / 4;
  }

  /** One iteration: nudge sim parameters toward real-world observations. */
  static iterate(sim: SimParameters, real: RealTelemetry, iteration: number): MatchResult {
    const realMean = this.mean(real.latenciesMs);
    const realP99 = this.percentile(real.latenciesMs, 99);
    const realFailRate = real.totalCalls > 0 ? real.failures / real.totalCalls : 0;
    const realCost = real.totalCalls > 0 ? real.totalCostCents / real.totalCalls : 0;

    const lr = 0.5; // exponential moving average factor
    const updated: SimParameters = {
      meanLatencyMs: sim.meanLatencyMs * (1 - lr) + realMean * lr,
      p99LatencyMs: sim.p99LatencyMs * (1 - lr) + realP99 * lr,
      failureRate: sim.failureRate * (1 - lr) + realFailRate * lr,
      costPerCall: sim.costPerCall * (1 - lr) + realCost * lr,
      custom: { ...sim.custom, ...(real.customMetrics ?? {}) },
    };

    const divergencePercent = this.divergence(updated, real);
    return {
      iteration,
      parameters: updated,
      divergencePercent,
      converged: divergencePercent < this.CONVERGENCE_THRESHOLD,
    };
  }

  /** Run iterations until convergence or maxIterations reached. */
  static converge(initial: SimParameters, real: RealTelemetry, maxIterations: number = 10): MatchResult[] {
    const results: MatchResult[] = [];
    let current = initial;
    for (let i = 1; i <= maxIterations; i++) {
      const r = this.iterate(current, real, i);
      results.push(r);
      current = r.parameters;
      if (r.converged) break;
    }
    return results;
  }

  private static mean(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  private static percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
    return sorted[idx] ?? 0;
  }

  private static pctDiff(a: number, b: number): number {
    const denom = Math.max(Math.abs(a), Math.abs(b), 1e-9);
    return Math.abs(a - b) / denom * 100;
  }
}
