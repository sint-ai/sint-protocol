/**
 * SINT Protocol — Behavior Tree node types.
 *
 * Defines the core abstractions for building behavior trees:
 * node status, tree node interface, and blackboard value types.
 *
 * @module @sint/engine-system2/bt/types
 */

import type { Blackboard } from "./blackboard.js";

/**
 * Status returned by a behavior tree node after a tick.
 *
 * - `"success"` — node completed successfully
 * - `"failure"` — node failed
 * - `"running"` — node is still executing and needs more ticks
 *
 * @example
 * ```ts
 * const status: NodeStatus = "success";
 * ```
 */
export type NodeStatus = "success" | "failure" | "running";

/**
 * Interface that all behavior tree nodes must implement.
 *
 * @example
 * ```ts
 * class MyNode implements TreeNode {
 *   readonly name = "my-node";
 *   async tick(blackboard: Blackboard): Promise<NodeStatus> {
 *     return "success";
 *   }
 *   reset(): void {}
 * }
 * ```
 */
export interface TreeNode {
  /** Human-readable node name for debugging and logging. */
  readonly name: string;

  /**
   * Execute a single tick of this node.
   *
   * @param blackboard - Shared state accessible to all nodes in the tree.
   * @returns The status after this tick.
   */
  tick(blackboard: Blackboard): Promise<NodeStatus>;

  /**
   * Reset the node to its initial state.
   * Called when the tree needs to restart execution.
   */
  reset(): void;
}

/** Type alias for blackboard values (opaque). */
export type BlackboardValue = unknown;

/** Type alias for blackboard keys. */
export type BlackboardKey = string;
