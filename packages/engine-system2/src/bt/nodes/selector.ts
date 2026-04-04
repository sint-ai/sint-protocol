/**
 * SINT Protocol — Selector behavior tree node.
 *
 * Ticks children until one succeeds. Returns failure only when ALL children fail.
 *
 * @module @sint/engine-system2/bt/nodes/selector
 */

import type { Blackboard } from "../blackboard.js";
import type { NodeStatus, TreeNode } from "../types.js";

/**
 * Selector node: ticks children until one succeeds.
 *
 * - Returns `"success"` as soon as any child succeeds.
 * - Returns `"running"` if a child is still running.
 * - Returns `"failure"` only if ALL children fail.
 *
 * @example
 * ```ts
 * const sel = new SelectorNode("find-target", [searchNearby, searchFar, giveUp]);
 * const status = await sel.tick(blackboard);
 * ```
 */
export class SelectorNode implements TreeNode {
  readonly name: string;
  private readonly _children: readonly TreeNode[];

  constructor(name: string, children: readonly TreeNode[]) {
    this.name = name;
    this._children = children;
  }

  async tick(blackboard: Blackboard): Promise<NodeStatus> {
    for (const child of this._children) {
      const status = await child.tick(blackboard);
      if (status === "success") {
        return "success";
      }
      if (status === "running") {
        return "running";
      }
    }
    return "failure";
  }

  reset(): void {
    for (const child of this._children) {
      child.reset();
    }
  }
}
