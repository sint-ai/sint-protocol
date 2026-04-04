/**
 * SINT Protocol — Behavior Tree Blackboard.
 *
 * A typed key-value store shared between all nodes in a behavior tree.
 * Provides the communication mechanism for nodes to share state.
 *
 * @module @sint/engine-system2/bt/blackboard
 */

/**
 * Shared state store for behavior tree nodes.
 *
 * The blackboard is the primary communication channel between
 * nodes in a behavior tree. Nodes read and write values to
 * coordinate behavior without direct coupling.
 *
 * @example
 * ```ts
 * const bb = new Blackboard();
 * bb.set("target", { x: 1, y: 2, z: 0 });
 * const target = bb.get<{ x: number; y: number; z: number }>("target");
 * ```
 */
export class Blackboard {
  private readonly _store: Map<string, unknown> = new Map();

  /**
   * Get a value from the blackboard by key.
   *
   * @param key - The key to look up.
   * @returns The value, or undefined if not present.
   *
   * @example
   * ```ts
   * const speed = blackboard.get<number>("speed");
   * ```
   */
  get<T>(key: string): T | undefined {
    return this._store.get(key) as T | undefined;
  }

  /**
   * Set a value on the blackboard.
   *
   * @param key - The key to store under.
   * @param value - The value to store.
   *
   * @example
   * ```ts
   * blackboard.set("speed", 1.5);
   * ```
   */
  set(key: string, value: unknown): void {
    this._store.set(key, value);
  }

  /**
   * Check if a key exists on the blackboard.
   *
   * @param key - The key to check.
   * @returns True if the key exists.
   *
   * @example
   * ```ts
   * if (blackboard.has("target")) { ... }
   * ```
   */
  has(key: string): boolean {
    return this._store.has(key);
  }

  /**
   * Delete a key from the blackboard.
   *
   * @param key - The key to delete.
   * @returns True if the key was present and deleted.
   *
   * @example
   * ```ts
   * blackboard.delete("staleData");
   * ```
   */
  delete(key: string): boolean {
    return this._store.delete(key);
  }

  /**
   * Return a frozen snapshot of the current blackboard state.
   *
   * @returns A frozen plain object copy of all key-value pairs.
   *
   * @example
   * ```ts
   * const snap = blackboard.snapshot();
   * // snap is frozen — modifications throw in strict mode
   * ```
   */
  snapshot(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of this._store) {
      result[key] = value;
    }
    return Object.freeze(result);
  }

  /**
   * Remove all entries from the blackboard.
   *
   * @example
   * ```ts
   * blackboard.clear();
   * ```
   */
  clear(): void {
    this._store.clear();
  }
}
