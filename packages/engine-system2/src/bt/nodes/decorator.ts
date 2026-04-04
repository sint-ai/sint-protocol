/**
 * SINT Protocol — Decorator behavior tree nodes.
 *
 * Decorators wrap a single child node and modify its behavior:
 * - InverterNode: inverts success/failure
 * - RepeatNode: repeats child N times
 * - RetryNode: retries child on failure
 *
 * @module @sint/engine-system2/bt/nodes/decorator
 */

import type { Blackboard } from "../blackboard.js";
import type { NodeStatus, TreeNode } from "../types.js";

/**
 * Inverter decorator: flips success and failure.
 *
 * - `"success"` becomes `"failure"`
 * - `"failure"` becomes `"success"`
 * - `"running"` stays `"running"`
 *
 * @example
 * ```ts
 * const notAtGoal = new InverterNode("not-at-goal", atGoalCondition);
 * ```
 */
export class InverterNode implements TreeNode {
  readonly name: string;
  private readonly _child: TreeNode;

  constructor(name: string, child: TreeNode) {
    this.name = name;
    this._child = child;
  }

  async tick(blackboard: Blackboard): Promise<NodeStatus> {
    const status = await this._child.tick(blackboard);
    if (status === "success") return "failure";
    if (status === "failure") return "success";
    return "running";
  }

  reset(): void {
    this._child.reset();
  }
}

/**
 * Repeat decorator: repeats child node N times.
 *
 * Returns `"success"` after N successful ticks.
 * Returns `"failure"` immediately if the child fails.
 * Returns `"running"` while repetitions remain or child is running.
 *
 * @example
 * ```ts
 * const patrol3Times = new RepeatNode("patrol-3x", patrolNode, 3);
 * ```
 */
export class RepeatNode implements TreeNode {
  readonly name: string;
  private readonly _child: TreeNode;
  private readonly _times: number;
  private _count: number = 0;

  constructor(name: string, child: TreeNode, times: number) {
    this.name = name;
    this._child = child;
    this._times = times;
  }

  async tick(blackboard: Blackboard): Promise<NodeStatus> {
    if (this._count >= this._times) {
      return "success";
    }

    const status = await this._child.tick(blackboard);

    if (status === "success") {
      this._count++;
      if (this._count >= this._times) {
        return "success";
      }
      return "running";
    }

    if (status === "failure") {
      return "failure";
    }

    return "running";
  }

  reset(): void {
    this._count = 0;
    this._child.reset();
  }
}

/**
 * Retry decorator: retries child on failure up to N times.
 *
 * Returns `"success"` if the child succeeds on any attempt.
 * Returns `"failure"` after exhausting all retry attempts.
 * Returns `"running"` while the child is running.
 *
 * @example
 * ```ts
 * const retryGrasp = new RetryNode("retry-grasp", graspAction, 3);
 * ```
 */
export class RetryNode implements TreeNode {
  readonly name: string;
  private readonly _child: TreeNode;
  private readonly _maxRetries: number;
  private _attempts: number = 0;

  constructor(name: string, child: TreeNode, maxRetries: number) {
    this.name = name;
    this._child = child;
    this._maxRetries = maxRetries;
  }

  async tick(blackboard: Blackboard): Promise<NodeStatus> {
    const status = await this._child.tick(blackboard);

    if (status === "success") {
      return "success";
    }

    if (status === "failure") {
      this._attempts++;
      if (this._attempts >= this._maxRetries) {
        return "failure";
      }
      this._child.reset();
      return "running";
    }

    return "running";
  }

  reset(): void {
    this._attempts = 0;
    this._child.reset();
  }
}
