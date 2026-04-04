/**
 * SINT Protocol — Plan Executor.
 *
 * Executes a validated plan step-by-step, routing each step through
 * an action callback (typically connected to PolicyGateway).
 *
 * @module @sint/engine-system2/planner/plan-executor
 */

import type { Result, SintPlan, SintPlanStep } from "@sint/core";
import { ok, err } from "@sint/core";

/** Event emitted by the plan executor. */
export interface PlanExecutorEvent {
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
}

/**
 * Executes plan steps sequentially, routing each through an action callback.
 *
 * If any step fails, remaining steps are aborted and the error is returned.
 *
 * @example
 * ```ts
 * const executor = new PlanExecutor(
 *   async (step) => {
 *     // Route through PolicyGateway
 *     return ok(undefined);
 *   },
 *   (event) => console.log(event),
 * );
 * const result = await executor.execute(plan);
 * ```
 */
export class PlanExecutor {
  private readonly _onAction: (
    step: SintPlanStep,
  ) => Promise<Result<void, Error>>;
  private readonly _onEvent?: (event: PlanExecutorEvent) => void;

  constructor(
    onAction: (step: SintPlanStep) => Promise<Result<void, Error>>,
    onEvent?: (event: PlanExecutorEvent) => void,
  ) {
    this._onAction = onAction;
    this._onEvent = onEvent;
  }

  /**
   * Execute a plan step-by-step.
   *
   * Each step is passed to the onAction callback. If the callback
   * returns an error, execution is aborted and remaining steps
   * are not executed.
   *
   * @param plan - The plan to execute.
   * @returns Ok on success, or an error describing which step failed.
   *
   * @example
   * ```ts
   * const result = await executor.execute(plan);
   * if (!result.ok) {
   *   console.error("Plan failed:", result.error.message);
   * }
   * ```
   */
  async execute(plan: SintPlan): Promise<Result<void, Error>> {
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      if (step === undefined) {
        continue;
      }

      const result = await this._onAction(step);

      this._onEvent?.({
        eventType: "engine.system2.plan.step.executed",
        payload: {
          planId: plan.planId,
          stepIndex: i,
          action: step.action,
          resource: step.resource,
          success: result.ok,
        },
      });

      if (!result.ok) {
        return err(
          new Error(
            `Plan execution failed at step ${i} ("${step.action}"): ${result.error.message}`,
          ),
        );
      }
    }

    return ok(undefined);
  }
}
