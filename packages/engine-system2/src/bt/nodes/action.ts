/**
 * SINT Protocol — Action behavior tree node.
 *
 * Executes an asynchronous action function. The action function should
 * route through PolicyGateway for any physical state changes.
 *
 * @module @sint/engine-system2/bt/nodes/action
 */

import type { Blackboard } from "../blackboard.js";
import type { NodeStatus, TreeNode } from "../types.js";

/**
 * Action node: delegates to an async function.
 *
 * The action function receives the blackboard and must return
 * a `NodeStatus`. Actions that interact with the physical world
 * should route through the PolicyGateway.
 *
 * @example
 * ```ts
 * const moveForward = new ActionNode("move-forward", async (bb) => {
 *   const speed = bb.get<number>("speed") ?? 0.5;
 *   // Route through PolicyGateway...
 *   return "success";
 * });
 * ```
 */
export class ActionNode implements TreeNode {
  readonly name: string;
  private readonly _action: (blackboard: Blackboard) => Promise<NodeStatus>;

  constructor(
    name: string,
    action: (blackboard: Blackboard) => Promise<NodeStatus>,
  ) {
    this.name = name;
    this._action = action;
  }

  async tick(blackboard: Blackboard): Promise<NodeStatus> {
    return this._action(blackboard);
  }

  reset(): void {
    // Action nodes delegate entirely to their function — nothing to reset.
  }
}
