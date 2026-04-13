/**
 * SINT Protocol — In-Memory Budget Adapter.
 *
 * Testing implementation of IBudgetPort that enforces a simple
 * per-user budget limit with running usage tracking.
 *
 * @module @sint/bridge-economy/adapters/in-memory-budget-adapter
 */

import { ok, type Result } from "@pshkv/core";
import type { IBudgetPort, BudgetCheckParams, BudgetCheckResult } from "../interfaces.js";

/**
 * In-memory budget adapter for testing.
 *
 * @example
 * ```ts
 * const adapter = new InMemoryBudgetAdapter(1000); // 1000 token budget
 * const result = await adapter.checkBudget({ userId: "u1", estimatedCost: 50, ... });
 * // result.value.allowed === true, remainingBudget === 1000
 * ```
 */
export class InMemoryBudgetAdapter implements IBudgetPort {
  private readonly budgetLimit: number;
  private readonly usage = new Map<string, number>();

  constructor(budgetLimit = 1000) {
    this.budgetLimit = budgetLimit;
  }

  async checkBudget(params: BudgetCheckParams): Promise<Result<BudgetCheckResult, Error>> {
    const currentUsage = this.usage.get(params.userId) ?? 0;
    const remaining = this.budgetLimit - currentUsage;
    const allowed = params.estimatedCost <= remaining;
    const usagePercent = (currentUsage / this.budgetLimit) * 100;

    if (allowed) {
      // Record usage
      this.usage.set(params.userId, currentUsage + params.estimatedCost);
    }

    return ok({
      allowed,
      remainingBudget: remaining,
      totalBudget: this.budgetLimit,
      usagePercent,
      isAlert: usagePercent >= 80,
    });
  }

  /** Reset usage for a user (test helper). */
  resetUsage(userId: string): void {
    this.usage.delete(userId);
  }

  /** Set specific usage (test helper). */
  setUsage(userId: string, usage: number): void {
    this.usage.set(userId, usage);
  }

  /** Get current usage (test helper). */
  getUsage(userId: string): number {
    return this.usage.get(userId) ?? 0;
  }
}
