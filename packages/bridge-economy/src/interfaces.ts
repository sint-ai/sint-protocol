/**
 * SINT Protocol — Economy Bridge port interfaces.
 *
 * These define the contracts that external economy services must
 * implement. The Port/Adapter pattern keeps sint-protocol decoupled
 * from any specific economy implementation.
 *
 * Each port mirrors the corresponding service in the product API
 * (BalanceService, BudgetService, TrustService) without coupling
 * to its internals.
 *
 * @module @sint/bridge-economy/interfaces
 */

import type { Result } from "@sint/core";

// ─── Balance Port ──────────────────────────────────────────────

/**
 * Current balance information for a user/agent.
 */
export interface BalanceInfo {
  /** User or agent identifier. */
  readonly userId: string;
  /** Current token balance. */
  readonly balance: number;
  /** ISO 8601 timestamp of last update. */
  readonly updatedAt: string;
}

/**
 * Port for token balance operations.
 *
 * Maps to the product API's BalanceService:
 * - getBalance → GET /balance/:userId
 * - withdraw → POST /balance/withdraw
 * - deposit → POST /balance/deposit
 */
export interface IBalancePort {
  /**
   * Get current balance for a user.
   *
   * @param userId - The user or agent identifier
   * @returns Balance info or error
   */
  getBalance(userId: string): Promise<Result<BalanceInfo, Error>>;

  /**
   * Withdraw tokens from a user's balance.
   *
   * @param userId - The user or agent identifier
   * @param tokens - Number of tokens to withdraw
   * @param description - Human-readable reason for the withdrawal
   * @param source - Source system identifier (e.g. "sint_protocol")
   * @returns Updated balance info or error
   */
  withdraw(
    userId: string,
    tokens: number,
    description: string,
    source: string,
  ): Promise<Result<BalanceInfo, Error>>;

  /**
   * Deposit tokens into a user's balance.
   *
   * @param userId - The user or agent identifier
   * @param tokens - Number of tokens to deposit
   * @param description - Human-readable reason for the deposit
   * @param source - Source system identifier
   * @returns Updated balance info or error
   */
  deposit(
    userId: string,
    tokens: number,
    description: string,
    source: string,
  ): Promise<Result<BalanceInfo, Error>>;
}

// ─── Budget Port ───────────────────────────────────────────────

/**
 * Budget check parameters.
 */
export interface BudgetCheckParams {
  /** User or agent identifier. */
  readonly userId: string;
  /** The action being performed. */
  readonly action: string;
  /** Target resource URI. */
  readonly resource: string;
  /** Estimated cost in tokens. */
  readonly estimatedCost: number;
}

/**
 * Result of a budget check.
 */
export interface BudgetCheckResult {
  /** Whether the action is within budget. */
  readonly allowed: boolean;
  /** Remaining budget in tokens. */
  readonly remainingBudget: number;
  /** Total budget limit in tokens. */
  readonly totalBudget: number;
  /** Usage percentage (0–100). */
  readonly usagePercent: number;
  /** Whether usage is approaching the limit (>80%). */
  readonly isAlert: boolean;
}

/**
 * Port for budget enforcement.
 *
 * Maps to the product API's BudgetService:
 * - checkBudget → POST /budgets/check
 */
export interface IBudgetPort {
  /**
   * Check whether an action is within the user's budget.
   *
   * @param params - Budget check parameters
   * @returns Budget check result or error
   */
  checkBudget(params: BudgetCheckParams): Promise<Result<BudgetCheckResult, Error>>;
}

// ─── Trust Port ────────────────────────────────────────────────

/**
 * Trust evaluation parameters.
 */
export interface TrustEvalParams {
  /** User or agent identifier. */
  readonly userId: string;
  /** Agent identifier (Ed25519 public key). */
  readonly agentId: string;
  /** The action being performed. */
  readonly action: string;
  /** Target resource URI. */
  readonly resource: string;
}

/**
 * Trust levels from the product API's TrustService.
 *
 * These map to SINT ApprovalTiers via trust-tier-mapper.ts.
 */
export type EconomyTrustLevel =
  | "unrestricted"
  | "low_risk"
  | "medium_risk"
  | "high_risk"
  | "blocked";

/**
 * Result of a trust evaluation.
 */
export interface TrustEvalResult {
  /** The evaluated trust level. */
  readonly trustLevel: EconomyTrustLevel;
  /** Trust score (0.0–1.0). */
  readonly score: number;
  /** Human-readable reason for the trust level assignment. */
  readonly reason: string;
}

/**
 * Port for trust evaluation.
 *
 * Maps to the product API's TrustService:
 * - evaluateTrust → POST /trust/evaluate
 */
export interface ITrustPort {
  /**
   * Evaluate trust level for an agent performing an action.
   *
   * @param params - Trust evaluation parameters
   * @returns Trust evaluation result or error
   */
  evaluateTrust(params: TrustEvalParams): Promise<Result<TrustEvalResult, Error>>;
}

// ─── Pricing Port ──────────────────────────────────────────────

/**
 * Pricing context for cost computation.
 */
export interface PricingContext {
  /** The action type (e.g. "tool_call", "capsule_exec", "ros2_publish"). */
  readonly actionType: string;
  /** Target resource URI. */
  readonly resource: string;
  /** Optional MCP server identifier for marketplace pricing. */
  readonly mcpServerId?: string;
}

/**
 * Pricing information for an action.
 */
export interface PricingInfo {
  /** Base cost in tokens before multipliers. */
  readonly baseCost: number;
  /** Cost multiplier for this specific resource/MCP. */
  readonly costMultiplier: number;
  /** Global markup multiplier. */
  readonly globalMarkup: number;
  /** Final computed cost in tokens. */
  readonly totalCost: number;
}

/**
 * Port for pricing/cost lookup.
 *
 * Maps to the product API's MCP marketplace pricing:
 * - getPrice → GET /mcps/:id/pricing
 */
export interface IPricingPort {
  /**
   * Get pricing information for an action.
   *
   * @param context - Pricing context
   * @returns Pricing information or error
   */
  getPrice(context: PricingContext): Promise<Result<PricingInfo, Error>>;
}
