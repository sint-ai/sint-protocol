import type { ErrorBudget, ReliabilityTier } from './types.js';

/** Maps reliability tier to allowed downtime per 30-day month (in minutes). */
const MONTHLY_BUDGETS: Record<ReliabilityTier, number> = {
  experimental: 7200,   // 5 days
  beta:          432,   // 7.2 hours
  production:     43.2, // 43.2 minutes
  critical:        4.32,
  safety:          0.432,
};

export class ErrorBudgetCalculator {
  /** Compute error budget for a tier given consumed downtime and elapsed period. */
  static compute(
    tier: ReliabilityTier,
    consumedMinutes: number,
    periodElapsedMs: number,
    periodTotalMs: number = 30 * 24 * 60 * 60 * 1000,
  ): ErrorBudget {
    const budgetMinutes = MONTHLY_BUDGETS[tier];
    const remainingMinutes = Math.max(0, budgetMinutes - consumedMinutes);
    const elapsedFraction = periodTotalMs > 0 ? periodElapsedMs / periodTotalMs : 0;
    const expectedConsumed = budgetMinutes * elapsedFraction;
    const burnRate = expectedConsumed > 0 ? consumedMinutes / expectedConsumed : 0;
    return {
      budgetMinutes,
      consumedMinutes,
      remainingMinutes,
      burnRate,
      isOverBudget: burnRate > 1.0,
    };
  }

  /** Get monthly budget allowance for a tier. */
  static budgetForTier(tier: ReliabilityTier): number {
    return MONTHLY_BUDGETS[tier];
  }
}
