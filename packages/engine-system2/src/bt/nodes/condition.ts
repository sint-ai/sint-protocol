/**
 * SINT Protocol — Condition behavior tree node.
 *
 * Evaluates a predicate against the blackboard. Never returns "running".
 *
 * @module @sint/engine-system2/bt/nodes/condition
 */

import type { Blackboard } from "../blackboard.js";
import type { NodeStatus, TreeNode } from "../types.js";

/**
 * Condition node: evaluates a synchronous predicate.
 *
 * - Returns `"success"` if the predicate returns true.
 * - Returns `"failure"` if the predicate returns false.
 * - Never returns `"running"`.
 *
 * @example
 * ```ts
 * const isClose = new ConditionNode("is-target-close", (bb) => {
 *   const dist = bb.get<number>("targetDistance");
 *   return dist !== undefined && dist < 2.0;
 * });
 * ```
 */
export class ConditionNode implements TreeNode {
  readonly name: string;
  private readonly _predicate: (blackboard: Blackboard) => boolean;

  constructor(name: string, predicate: (blackboard: Blackboard) => boolean) {
    this.name = name;
    this._predicate = predicate;
  }

  async tick(blackboard: Blackboard): Promise<NodeStatus> {
    return this._predicate(blackboard) ? "success" : "failure";
  }

  reset(): void {
    // Condition nodes are stateless — nothing to reset.
  }
}
