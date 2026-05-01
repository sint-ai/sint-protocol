import { describe, it, expect } from 'vitest';
import { EdgeAgent, type EdgePolicy } from '../src/index.js';

const policy: EdgePolicy = {
  table: new Map([
    [JSON.stringify({ x: 1 }), { action: 'go', confidence: 0.95 }],
    [JSON.stringify({ x: 2 }), { action: 'wait', confidence: 0.4 }],
  ]),
  escalationThreshold: 0.7,
  latencyBudgetMs: 100,
};

describe('EdgeAgent', () => {
  it('returns confident decision without escalation', () => {
    const agent = new EdgeAgent(policy);
    const decision = agent.decide({ x: 1 });
    expect(decision.action).toBe('go');
    expect(decision.escalateToCloud).toBe(false);
  });

  it('escalates when confidence below threshold', () => {
    const agent = new EdgeAgent(policy);
    const decision = agent.decide({ x: 2 });
    expect(decision.escalateToCloud).toBe(true);
    expect(decision.reason).toBe('low_confidence');
  });

  it('escalates when no entry in table', () => {
    const agent = new EdgeAgent(policy);
    const decision = agent.decide({ x: 999 });
    expect(decision.escalateToCloud).toBe(true);
    expect(decision.reason).toBe('no_match_in_table');
  });

  it('reports footprint bytes', () => {
    const agent = new EdgeAgent(policy);
    expect(agent.footprintBytes()).toBeGreaterThan(0);
  });

  it('tracks escalation rate', () => {
    const agent = new EdgeAgent(policy);
    agent.decide({ x: 1 });
    agent.decide({ x: 2 });
    expect(agent.stats().escalationRate).toBe(0.5);
  });
});
