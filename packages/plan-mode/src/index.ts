/**
 * plan-mode: multi-step task execution with state-aware replanning.
 *
 * Mirrors the Applied Intuition mining example: a scoop changes the world's
 * state; the next planned action must adapt to the new state. If actual state
 * diverges from predicted state, replanning is triggered.
 */

export interface PlanStep {
  id: string;
  description: string;
  /** Predicate over current state — must be true to execute step */
  precondition: (state: WorldState) => boolean;
  /** Action that produces the next state */
  execute: (state: WorldState) => Promise<WorldState>;
  /** Predicate over post-state — must be true after step completes */
  postcondition: (state: WorldState) => boolean;
}

export type WorldState = Record<string, unknown>;

export interface PlanExecutionEvent {
  type: 'step_start' | 'step_complete' | 'replan_triggered' | 'plan_complete' | 'plan_failed';
  stepId?: string;
  state: WorldState;
  reason?: string;
  timestamp: number;
}

export type Replanner = (currentState: WorldState, originalPlan: PlanStep[]) => Promise<PlanStep[]>;

export interface PlanExecutorConfig {
  replanner?: Replanner;
  maxReplans: number;
  emitEvent?: (event: PlanExecutionEvent) => void;
}

export class PlanExecutor {
  private config: PlanExecutorConfig;
  private replanCount = 0;
  private events: PlanExecutionEvent[] = [];

  constructor(config: PlanExecutorConfig) {
    this.config = config;
  }

  async execute(plan: PlanStep[], initialState: WorldState): Promise<{ state: WorldState; events: PlanExecutionEvent[]; success: boolean }> {
    let state = initialState;
    let currentPlan = plan;
    let stepIdx = 0;

    while (stepIdx < currentPlan.length) {
      const step = currentPlan[stepIdx];
      if (!step) break;

      // Precondition check — if not met, trigger replan
      if (!step.precondition(state)) {
        if (this.replanCount >= this.config.maxReplans || !this.config.replanner) {
          this.emit({
            type: 'plan_failed',
            stepId: step.id,
            state,
            reason: 'precondition_failed_no_replan',
            timestamp: Date.now(),
          });
          return { state, events: this.events, success: false };
        }
        this.replanCount++;
        this.emit({
          type: 'replan_triggered',
          stepId: step.id,
          state,
          reason: 'precondition_failed',
          timestamp: Date.now(),
        });
        currentPlan = await this.config.replanner(state, plan);
        stepIdx = 0;
        continue;
      }

      this.emit({ type: 'step_start', stepId: step.id, state, timestamp: Date.now() });
      state = await step.execute(state);

      // Postcondition check — if violated, replan
      if (!step.postcondition(state)) {
        if (this.replanCount >= this.config.maxReplans || !this.config.replanner) {
          this.emit({
            type: 'plan_failed',
            stepId: step.id,
            state,
            reason: 'postcondition_violated_no_replan',
            timestamp: Date.now(),
          });
          return { state, events: this.events, success: false };
        }
        this.replanCount++;
        this.emit({
          type: 'replan_triggered',
          stepId: step.id,
          state,
          reason: 'postcondition_violated',
          timestamp: Date.now(),
        });
        currentPlan = await this.config.replanner(state, plan);
        stepIdx = 0;
        continue;
      }

      this.emit({ type: 'step_complete', stepId: step.id, state, timestamp: Date.now() });
      stepIdx++;
    }

    this.emit({ type: 'plan_complete', state, timestamp: Date.now() });
    return { state, events: this.events, success: true };
  }

  private emit(event: PlanExecutionEvent) {
    this.events.push(event);
    this.config.emitEvent?.(event);
  }
}
