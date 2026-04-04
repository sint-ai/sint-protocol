/**
 * SINT Protocol — Behavior Tree Executor.
 *
 * Manages the lifecycle of a behavior tree, providing periodic ticking
 * and event emission for observability.
 *
 * @module @sint/engine-system2/bt/tree-executor
 */

import type { Blackboard } from "./blackboard.js";
import type { NodeStatus, TreeNode } from "./types.js";

/** Configuration for the tree executor. */
export interface TreeExecutorConfig {
  /** Interval between ticks in milliseconds. Defaults to 100. */
  readonly tickRateMs?: number;
}

/** Event emitted by the tree executor. */
export interface TreeExecutorEvent {
  readonly eventType: string;
  readonly payload: Record<string, unknown>;
}

/**
 * Executes a behavior tree by ticking its root node at a configurable rate.
 *
 * @example
 * ```ts
 * const executor = new TreeExecutor(rootNode, blackboard, { tickRateMs: 50 });
 * executor.start();
 * // ... later
 * executor.stop();
 * ```
 */
export class TreeExecutor {
  private readonly _root: TreeNode;
  private readonly _blackboard: Blackboard;
  private readonly _tickRateMs: number;
  private readonly _onEvent?: (event: TreeExecutorEvent) => void;
  private _timer: ReturnType<typeof setInterval> | null = null;
  private _running: boolean = false;
  private _tickCount: number = 0;

  constructor(
    root: TreeNode,
    blackboard: Blackboard,
    config?: TreeExecutorConfig,
    onEvent?: (event: TreeExecutorEvent) => void,
  ) {
    this._root = root;
    this._blackboard = blackboard;
    this._tickRateMs = config?.tickRateMs ?? 100;
    this._onEvent = onEvent;
  }

  /**
   * Start periodic ticking of the behavior tree.
   *
   * @example
   * ```ts
   * executor.start();
   * ```
   */
  start(): void {
    if (this._running) {
      return;
    }
    this._running = true;
    this._timer = setInterval(() => {
      void this.tickOnce();
    }, this._tickRateMs);
  }

  /**
   * Stop periodic ticking.
   *
   * @example
   * ```ts
   * executor.stop();
   * ```
   */
  stop(): void {
    this._running = false;
    if (this._timer !== null) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  /**
   * Execute a single tick of the behavior tree root node.
   *
   * @returns The status of the root node after this tick.
   *
   * @example
   * ```ts
   * const status = await executor.tickOnce();
   * ```
   */
  async tickOnce(): Promise<NodeStatus> {
    if (!this._running) {
      return "failure";
    }

    this._tickCount++;
    const status = await this._root.tick(this._blackboard);

    this._onEvent?.({
      eventType: "engine.system2.tick",
      payload: {
        tickNumber: this._tickCount,
        rootNode: this._root.name,
        status,
      },
    });

    return status;
  }

  /**
   * Check if the executor is currently running.
   *
   * @returns True if the executor is actively ticking.
   *
   * @example
   * ```ts
   * if (executor.isRunning()) { ... }
   * ```
   */
  isRunning(): boolean {
    return this._running;
  }
}
