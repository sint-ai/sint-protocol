import { describe, it, expect } from 'vitest';
import { SimRealMatcher, type SimParameters, type RealTelemetry } from '../src/index.js';

describe('SimRealMatcher', () => {
  it('converges sim parameters toward real telemetry over iterations', () => {
    const initial: SimParameters = {
      meanLatencyMs: 100,
      p99LatencyMs: 500,
      failureRate: 0.01,
      costPerCall: 0.1,
      custom: {},
    };
    const real: RealTelemetry = {
      latenciesMs: [200, 210, 220, 230, 240, 250],
      failures: 5,
      totalCalls: 100,
      totalCostCents: 25,
    };
    const results = SimRealMatcher.converge(initial, real, 20);
    expect(results.length).toBeGreaterThan(0);
    const last = results[results.length - 1];
    expect(last.parameters.meanLatencyMs).toBeGreaterThan(150);
    expect(last.divergencePercent).toBeLessThan(SimRealMatcher.CONVERGENCE_THRESHOLD);
  });

  it('reports zero divergence when sim already matches real', () => {
    const real: RealTelemetry = {
      latenciesMs: [100, 100, 100],
      failures: 0,
      totalCalls: 100,
      totalCostCents: 10,
    };
    const sim: SimParameters = { meanLatencyMs: 100, p99LatencyMs: 100, failureRate: 0, costPerCall: 0.1, custom: {} };
    expect(SimRealMatcher.divergence(sim, real)).toBeLessThan(0.01);
  });
});
