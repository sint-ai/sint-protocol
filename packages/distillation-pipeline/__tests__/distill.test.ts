import { describe, it, expect } from 'vitest';
import { DistillationPipeline, type CloudTrace } from '../src/index.js';

const traces: CloudTrace[] = [
  { observationKey: 'a', action: 'go', confidence: 0.9, count: 100 },
  { observationKey: 'a', action: 'wait', confidence: 0.5, count: 1 },
  { observationKey: 'b', action: 'stop', confidence: 0.8, count: 50 },
  { observationKey: 'c', action: 'turn', confidence: 0.6, count: 1 }, // below minOccurrences
];

describe('DistillationPipeline', () => {
  it('compiles traces into an edge policy table', () => {
    const policy = DistillationPipeline.compile(traces, {
      minOccurrences: 5,
      maxActionVarianceFraction: 0.3,
      maxEntries: 1000,
    });
    expect(policy.coverage).toBe(2);
    expect(policy.table.get('a')?.action).toBe('go');
    expect(policy.table.has('c')).toBe(false);
    expect(policy.footprintBytes).toBeGreaterThan(0);
  });

  it('rejects observations with non-deterministic actions', () => {
    const noisyTraces: CloudTrace[] = [
      { observationKey: 'x', action: 'a1', confidence: 0.9, count: 50 },
      { observationKey: 'x', action: 'a2', confidence: 0.9, count: 50 },
    ];
    const policy = DistillationPipeline.compile(noisyTraces, {
      minOccurrences: 10,
      maxActionVarianceFraction: 0.1,
      maxEntries: 100,
    });
    expect(policy.coverage).toBe(0);
  });
});
