/**
 * SINT Protocol — Economy Bridge error types.
 *
 * Typed errors for economy-related failures. Each extends Error
 * with structured fields for programmatic handling.
 *
 * @module @sint/bridge-economy/errors
 */

/**
 * Base error for all economy-related failures.
 */
export class EconomyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "EconomyError";
    this.code = code;
  }
}

/**
 * Thrown when a user's token balance is insufficient for an action.
 */
export class InsufficientBalanceError extends EconomyError {
  readonly userId: string;
  readonly required: number;
  readonly available: number;

  constructor(userId: string, required: number, available: number) {
    super(
      "INSUFFICIENT_BALANCE",
      `Insufficient balance for user "${userId}": requires ${required} tokens, has ${available}`,
    );
    this.name = "InsufficientBalanceError";
    this.userId = userId;
    this.required = required;
    this.available = available;
  }
}

/**
 * Thrown when an action exceeds the user's budget limit.
 */
export class BudgetExceededError extends EconomyError {
  readonly userId: string;
  readonly estimatedCost: number;
  readonly remainingBudget: number;

  constructor(userId: string, estimatedCost: number, remainingBudget: number) {
    super(
      "BUDGET_EXCEEDED",
      `Budget exceeded for user "${userId}": action costs ${estimatedCost} tokens, budget remaining ${remainingBudget}`,
    );
    this.name = "BudgetExceededError";
    this.userId = userId;
    this.estimatedCost = estimatedCost;
    this.remainingBudget = remainingBudget;
  }
}

/**
 * Thrown when trust evaluation blocks the action.
 */
export class TrustBlockedError extends EconomyError {
  readonly userId: string;
  readonly trustLevel: string;
  readonly reason: string;

  constructor(userId: string, trustLevel: string, reason: string) {
    super(
      "TRUST_BLOCKED",
      `Action blocked by trust evaluation for user "${userId}": level="${trustLevel}", reason="${reason}"`,
    );
    this.name = "TrustBlockedError";
    this.userId = userId;
    this.trustLevel = trustLevel;
    this.reason = reason;
  }
}
