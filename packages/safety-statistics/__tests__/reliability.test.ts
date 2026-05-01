import { describe, it, expect } from 'vitest';
import { ReliabilityCalculator } from '../src/reliability-calculator.js';
import { ErrorBudgetCalculator } from '../src/error-budget.js';
import { IncidentAggregator } from '../src/incident-aggregator.js';
import type { FailureEvent } from '../src/types.js';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('ReliabilityCalculator', () => {
  it('returns operating window as MTBF when no failures', () => {
    expect(ReliabilityCalculator.mtbfHours([], 1000 * HOUR)).toBe(1000);
  });

  it('computes MTBF from failure count', () => {
    const failures: FailureEvent[] = Array.from({ length: 10 }, (_, i) => ({
      timestamp: Date.now() - i * HOUR,
      agentId: 'a1',
      severity: 'low',
      category: 'timeout',
      resolved: true,
      resolutionTimeMs: 60_000,
    }));
    expect(ReliabilityCalculator.mtbfHours(failures, 100 * HOUR)).toBe(10);
  });

  it('maps availability to nines correctly', () => {
    expect(Math.round(ReliabilityCalculator.toNines(0.999))).toBe(3);
    expect(Math.round(ReliabilityCalculator.toNines(0.9999))).toBe(4);
  });

  it('maps availability to tier correctly', () => {
    expect(ReliabilityCalculator.toTier(0.999)).toBe('production');
    expect(ReliabilityCalculator.toTier(0.99999)).toBe('safety');
    expect(ReliabilityCalculator.toTier(0.5)).toBe('experimental');
  });
});

describe('ErrorBudgetCalculator', () => {
  it('flags over-budget when burn rate > 1', () => {
    const half = 15 * DAY;
    const budget = ErrorBudgetCalculator.compute('production', 30, half);
    expect(budget.burnRate).toBeGreaterThan(1);
    expect(budget.isOverBudget).toBe(true);
  });

  it('returns correct budget for tier', () => {
    expect(ErrorBudgetCalculator.budgetForTier('production')).toBeCloseTo(43.2);
    expect(ErrorBudgetCalculator.budgetForTier('safety')).toBeCloseTo(0.432);
  });
});

describe('IncidentAggregator', () => {
  it('separates program killers from noise', () => {
    const failures: FailureEvent[] = [
      { timestamp: 0, agentId: 'a', severity: 'critical', category: 'safety', resolved: false },
      { timestamp: 0, agentId: 'a', severity: 'low', category: 'timeout', resolved: true, resolutionTimeMs: 1000 },
    ];
    const agg = IncidentAggregator.aggregate(failures);
    expect(agg.programKillers).toBe(1);
    expect(agg.noise).toBe(1);
  });

  it('computes incident rate per million decisions', () => {
    const f = [{ timestamp: 0, agentId: 'a', severity: 'low' as const, category: 't', resolved: true }];
    expect(IncidentAggregator.rate(f, 1_000_000)).toBe(1);
  });
});
