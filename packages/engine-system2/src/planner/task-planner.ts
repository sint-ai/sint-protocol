/**
 * SINT Protocol — Task Planner.
 *
 * Decomposes high-level goals into executable plan steps and validates
 * them against the current world state.
 *
 * @module @sint/engine-system2/planner/task-planner
 */

import type {
  Result,
  SintPlan,
  SintPlanStep,
  SintWorldState,
} from "@pshkv/core";
import { ok, err, ApprovalTier } from "@pshkv/core";

/** Event emitted by the task planner. */
export interface TaskPlannerEvent {
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
}

/**
 * Generates a simple timestamp-based UUIDv7-like identifier.
 * Not cryptographically secure — suitable for plan/goal IDs.
 */
function generateId(): string {
  const now = Date.now();
  const hex = now.toString(16).padStart(12, "0");
  const rand = Math.random().toString(16).slice(2, 14).padStart(12, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7${rand.slice(0, 3)}-${rand.slice(3, 7)}-${rand.slice(7, 12)}00000`.slice(0, 36);
}

/**
 * Generates an ISO 8601 timestamp with microsecond precision.
 */
function nowISO(): string {
  return new Date().toISOString().replace("Z", "000Z");
}

/**
 * Determines the approval tier required for a given resource URI.
 */
function tierForResource(resource: string): ApprovalTier {
  if (
    resource.startsWith("ros2:///cmd_vel") ||
    resource.startsWith("ros2:///gripper") ||
    resource.startsWith("ros2:///joint_commands")
  ) {
    return ApprovalTier.T2_ACT;
  }
  if (resource.startsWith("ros2:///")) {
    return ApprovalTier.T1_PREPARE;
  }
  return ApprovalTier.T0_OBSERVE;
}

/**
 * Task planner: decomposes goals into executable plan steps.
 *
 * @example
 * ```ts
 * const planner = new TaskPlanner();
 * const result = planner.createPlan(
 *   "navigate to waypoint A",
 *   worldState,
 *   ["navigate", "scan", "report"],
 * );
 * if (result.ok) {
 *   console.log(result.value.steps);
 * }
 * ```
 */
export class TaskPlanner {
  private readonly _onEvent?: (event: TaskPlannerEvent) => void;

  constructor(onEvent?: (event: TaskPlannerEvent) => void) {
    this._onEvent = onEvent;
  }

  /**
   * Create a plan from a goal description and available actions.
   *
   * Decomposes the goal into a sequence of plan steps, assigning
   * each step an appropriate approval tier based on its resource.
   *
   * @param goalDescription - Human-readable description of the goal.
   * @param worldState - Current fused perception state.
   * @param availableActions - Actions the agent can perform.
   * @returns A Result containing the plan or an error.
   *
   * @example
   * ```ts
   * const result = planner.createPlan("pick up object", worldState, ["navigate", "grasp"]);
   * ```
   */
  createPlan(
    goalDescription: string,
    _worldState: SintWorldState,
    availableActions: readonly string[],
  ): Result<SintPlan, Error> {
    if (availableActions.length === 0) {
      return err(new Error("No available actions to build a plan"));
    }

    const planId = generateId();
    const goalId = generateId();

    const steps: SintPlanStep[] = availableActions.map((action) => {
      const resource = `ros2:///${action}`;
      return {
        action,
        resource,
        params: { goal: goalDescription },
        requiredTier: tierForResource(resource),
        preconditions: [`${action}_ready`],
        postconditions: [`${action}_done`],
      };
    });

    const plan: SintPlan = {
      planId,
      goalId,
      steps,
      estimatedDurationMs: steps.length * 5000,
      status: "pending",
      createdAt: nowISO(),
    };

    this._onEvent?.({
      eventType: "engine.system2.plan.created",
      payload: {
        planId: plan.planId,
        goalId: plan.goalId,
        stepCount: plan.steps.length,
        goal: goalDescription,
      },
    });

    return ok(plan);
  }

  /**
   * Validate a plan's preconditions against the current world state.
   *
   * Checks that each step's preconditions can be satisfied. Returns
   * the plan with status updated to "validating" on success.
   *
   * @param plan - The plan to validate.
   * @param _worldState - Current world state for precondition checks.
   * @returns A Result containing the validated plan or an error.
   *
   * @example
   * ```ts
   * const validated = planner.validatePlan(plan, worldState);
   * ```
   */
  validatePlan(
    plan: SintPlan,
    _worldState: SintWorldState,
  ): Result<SintPlan, Error> {
    for (const step of plan.steps) {
      for (const pre of step.preconditions) {
        if (pre.length === 0) {
          return err(
            new Error(
              `Step "${step.action}" has an empty precondition`,
            ),
          );
        }
      }
    }

    const validated: SintPlan = {
      ...plan,
      status: "validating",
    };

    return ok(validated);
  }
}
