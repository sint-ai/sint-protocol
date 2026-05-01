import { describe, it, expect } from 'vitest';
import { PlanExecutor, type PlanStep, type WorldState } from '../src/index.js';

describe('PlanExecutor', () => {
  it('executes a successful plan to completion', async () => {
    const plan: PlanStep[] = [
      {
        id: 'step1',
        description: 'increment counter',
        precondition: (s) => (s.count as number) === 0,
        execute: async (s) => ({ ...s, count: 1 }),
        postcondition: (s) => (s.count as number) === 1,
      },
      {
        id: 'step2',
        description: 'double counter',
        precondition: (s) => (s.count as number) === 1,
        execute: async (s) => ({ ...s, count: (s.count as number) * 2 }),
        postcondition: (s) => (s.count as number) === 2,
      },
    ];
    const exec = new PlanExecutor({ maxReplans: 0 });
    const result = await exec.execute(plan, { count: 0 });
    expect(result.success).toBe(true);
    expect(result.state.count).toBe(2);
  });

  it('triggers replan when precondition fails', async () => {
    const plan: PlanStep[] = [{
      id: 's1',
      description: 'fail',
      precondition: () => false,
      execute: async (s: WorldState) => s,
      postcondition: () => true,
    }];
    let replanCalled = false;
    const exec = new PlanExecutor({
      maxReplans: 1,
      replanner: async () => {
        replanCalled = true;
        return [{
          id: 's2',
          description: 'pass',
          precondition: () => true,
          execute: async (s: WorldState) => ({ ...s, ok: true }),
          postcondition: (s) => s.ok === true,
        }];
      },
    });
    const result = await exec.execute(plan, {});
    expect(replanCalled).toBe(true);
    expect(result.success).toBe(true);
  });

  it('fails when no replanner and precondition violated', async () => {
    const plan: PlanStep[] = [{
      id: 's1',
      description: 'fail',
      precondition: () => false,
      execute: async (s: WorldState) => s,
      postcondition: () => true,
    }];
    const exec = new PlanExecutor({ maxReplans: 0 });
    const result = await exec.execute(plan, {});
    expect(result.success).toBe(false);
    expect(result.events.some((e) => e.type === 'plan_failed')).toBe(true);
  });
});
