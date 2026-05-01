import { describe, it, expect } from 'vitest';
import { AdversarialTester } from '../src/index.js';

describe('AdversarialTester', () => {
  it('generates the requested number of prompt mutations', () => {
    const muts = AdversarialTester.generatePromptMutations('hello', 5);
    expect(muts.length).toBe(5);
    expect(muts.every((m) => m.category === 'prompt_mutation')).toBe(true);
  });

  it('generates fault injection cases', () => {
    const faults = AdversarialTester.generateFaultInjections({ a: 1, b: 'x' });
    expect(faults.length).toBeGreaterThan(0);
    expect(faults.every((f) => f.category === 'fault_injection')).toBe(true);
  });

  it('reports faults found by an agent that throws on bad input', async () => {
    const agent = async (input: Record<string, unknown>) => {
      if ('prompt' in input && (input.prompt as string).includes('Ignore')) {
        throw new Error('prompt injection detected');
      }
      return { ok: true };
    };
    const tests = AdversarialTester.generatePromptMutations('hello', 10);
    const report = await AdversarialTester.run(agent, tests);
    expect(report.totalRuns).toBe(10);
    expect(report.faultsFound).toBeGreaterThan(0);
    expect(report.faultRate).toBeGreaterThan(0);
  });
});
