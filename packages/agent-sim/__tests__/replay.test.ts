import { describe, it, expect } from 'vitest';
import { ReplayHarness } from '../src/replay.js';
import { AdversarialInjector } from '../src/adversarial-injector.js';
import type { DecisionTrace } from '../src/types.js';

const trace: DecisionTrace[] = [
  { id: '1', timestamp: 1, agentId: 'a', observation: { x: 1 }, action: { type: 'go' }, latencyMs: 10 },
  { id: '2', timestamp: 2, agentId: 'a', observation: { x: 2 }, action: { type: 'stop' }, latencyMs: 12 },
];

describe('ReplayHarness', () => {
  it('reports zero divergences for identical agent', async () => {
    const result = await ReplayHarness.replay(trace, async (obs) => {
      const x = obs.x as number;
      return { action: { type: x === 1 ? 'go' : 'stop' }, latencyMs: 10 };
    });
    expect(result.divergences).toHaveLength(0);
    expect(result.totalDecisions).toBe(2);
  });

  it('reports major divergence when action type changes', async () => {
    const result = await ReplayHarness.replay(trace, async () => ({ action: { type: 'turn' }, latencyMs: 10 }));
    expect(result.divergences.length).toBeGreaterThan(0);
    expect(result.divergences[0].severity).toBe('major');
  });
});

describe('AdversarialInjector', () => {
  it('inserts events after specified decisions', () => {
    const events = [{ type: 'mcp_timeout' as const, insertAfterDecision: 0 }];
    const injected = AdversarialInjector.inject(trace, events);
    expect(injected.length).toBe(3);
    expect(injected[1].observation).toMatchObject({ adversarial: true, type: 'mcp_timeout' });
  });

  it('default battery generates 5 standard events', () => {
    expect(AdversarialInjector.defaultBattery(100).length).toBe(5);
  });
});
