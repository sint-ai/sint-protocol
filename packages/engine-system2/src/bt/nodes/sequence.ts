/**
 * SINT Protocol — Sequence behavior tree node.
 *
 * Ticks children in order. Returns failure immediately on any child failure.
 * Returns success only when ALL children succeed.
 *
 * @module @sint/engine-system2/bt/nodes/sequence
 */

import type { Blackboard } from "../blackboard.js";
import type { NodeStatus, TreeNode } from "../types.js";

/**
 * Sequence node: ticks children left-to-right.
 *
 * - Returns `"failure"` as soon as any child fails.
 * - Returns `"running"` if a child is still running.
 * - Returns `"success"` only if ALL children succeed.
 *
 * @example
 * ```ts
 * const seq = new SequenceNode("patrol", [moveNode, scanNode, reportNode]);
 * const status = await seq.tick(blackboard);
 * ```
 */
export class SequenceNode implements TreeNode {
  readonly name: string;
  private readonly _children: readonly TreeNode[];

  constructor(name: string, children: readonly TreeNode[]) {
    this.name = name;
    this._children = children;
  }

  async tick(blackboard: Blackboard): Promise<NodeStatus> {
    for (const child of this._children) {
      const status = await child.tick(blackboard);
      if (status === "failure") {
        return "failure";
      }
      if (status === "running") {
        return "running";
      }
    }
    return "success";
  }

  reset(): void {
    for (const child of this._children) {
      child.reset();
    }
  }
}
