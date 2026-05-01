import { describe, it, expect } from 'vitest';
import { CloudAgent } from '../src/index.js';

describe('CloudAgent', () => {
  it('returns action with reasoning and cost estimate', async () => {
    const agent = new CloudAgent(
      { mcpServers: ['solana'], thinkingBudget: 1000, emitEdgeUpdates: true },
      async () => ({ action: 'transfer', reasoning: 'wallet has funds', toolsUsed: ['solana_make_transaction'] }),
    );
    const decision = await agent.decide({ amount: 100 });
    expect(decision.action).toBe('transfer');
    expect(decision.costCents).toBeGreaterThan(0);
    expect(decision.edgeUpdate).toBeDefined();
  });

  it('skips edge update when disabled', async () => {
    const agent = new CloudAgent(
      { mcpServers: [], thinkingBudget: 0, emitEdgeUpdates: false },
      async () => ({ action: 'noop', reasoning: '', toolsUsed: [] }),
    );
    const decision = await agent.decide({ a: 1 });
    expect(decision.edgeUpdate).toBeUndefined();
  });
});
