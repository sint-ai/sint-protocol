/**
 * SINT Protocol — Parallel behavior tree node.
 *
 * Ticks ALL children on each tick. Uses a success threshold to determine
 * the aggregate result.
 *
 * @module @sint/engine-system2/bt/nodes/parallel
 */

import type { Blackboard } from "../blackboard.js";
import type { NodeStatus, TreeNode } from "../types.js";

/**
 * Parallel node: ticks all children simultaneously.
 *
 * - Returns `"success"` when `successThreshold` children have succeeded.
 * - Returns `"failure"` when too many children have failed to reach the threshold.
 * - Otherwise returns `"running"`.
 *
 * @example
 * ```ts
 * const par = new ParallelNode("monitor-all", [sensor1, sensor2, sensor3], 2);
 * const status = await par.tick(blackboard);
 * ```
 */
export class ParallelNode implements TreeNode {
  readonly name: string;
  private readonly _children: readonly TreeNode[];
  private readonly _successThreshold: number;

  constructor(name: string, children: readonly TreeNode[], successThreshold: number) {
    this.name = name;
    this._children = children;
    this._successThreshold = successThreshold;
  }

  async tick(blackboard: Blackboard): Promise<NodeStatus> {
    if (this._children.length === 0) {
      return "success";
    }

    let successCount = 0;
    let failureCount = 0;

    const results = await Promise.all(
      this._children.map((child) => child.tick(blackboard)),
    );

    for (const status of results) {
      if (status === "success") {
        successCount++;
      } else if (status === "failure") {
        failureCount++;
      }
    }

    if (successCount >= this._successThreshold) {
      return "success";
    }

    const maxPossibleSuccesses = this._children.length - failureCount;
    if (maxPossibleSuccesses < this._successThreshold) {
      return "failure";
    }

    return "running";
  }

  reset(): void {
    for (const child of this._children) {
      child.reset();
    }
  }
}
