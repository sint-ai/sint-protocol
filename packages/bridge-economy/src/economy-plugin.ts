/**
 * SINT Protocol — Economy Plugin for PolicyGateway.
 *
 * The EconomyPlugin provides pre/post intercept hooks that wire
 * budget enforcement, balance checking, trust evaluation, and
 * billing into the PolicyGateway's decision flow.
 *
 * Flow:
 *   preIntercept(request):
 *     1. Resolve userId from agentId
 *     2. computeActionCost(request) → tokens
 *     3. IBudgetPort.checkBudget() → deny if exceeded
 *     4. IBalancePort.getBalance() → deny if insufficient
 *     5. ITrustPort.evaluateTrust() → deny if blocked, note escalation
 *     6. Return undefined → let PolicyGateway proceed normally
 *        OR return PolicyDecision to short-circuit
 *
 *   postIntercept(request, decision):
 *     1. Only runs when decision.action === "allow"
 *     2. IBalancePort.withdraw(userId, tokens, description, "sint_protocol")
 *     3. Emit "economy.action.billed" to ledger
 *
 * Error handling: fail-open. If any economy service is unreachable,
 * the request proceeds through normal PolicyGateway logic.
 *
 * @module @sint/bridge-economy/economy-plugin
 */

import type { PolicyDecision, SintRequest, ApprovalTier, RiskTier } from "@sint/core";
import type { LedgerEmitter } from "@sint/gate-policy-gateway";
import type {
  IBalancePort,
  IBudgetPort,
  ITrustPort,
  IPricingPort,
} from "./interfaces.js";
import { computeActionCost } from "./pricing-calculator.js";
import { mapTrustLevelToApprovalTier } from "./trust-tier-mapper.js";
import { EconomyLedgerEmitter } from "./ledger-emitter.js";
import {
  InsufficientBalanceError,
  BudgetExceededError,
  TrustBlockedError,
} from "./errors.js";

/**
 * Configuration for the EconomyPlugin.
 */
export interface EconomyPluginConfig {
  /** Port for balance operations. */
  readonly balancePort: IBalancePort;
  /** Port for budget enforcement. */
  readonly budgetPort: IBudgetPort;
  /** Port for trust evaluation. */
  readonly trustPort: ITrustPort;
  /** Port for pricing lookup (optional — uses defaults if absent). */
  readonly pricingPort?: IPricingPort;
  /** Ledger event emitter (optional — events silently dropped if absent). */
  readonly emitLedgerEvent?: LedgerEmitter;
  /**
   * Resolve a userId from an agentId.
   * Default: uses agentId as userId directly.
   */
  readonly resolveUserId?: (agentId: string) => string | Promise<string>;
}

/**
 * Result of preIntercept — either a short-circuit decision or undefined
 * to let the gateway proceed normally. Includes metadata for postIntercept.
 */
export interface PreInterceptResult {
  /** Short-circuit decision, or undefined to proceed. */
  readonly decision?: PolicyDecision;
  /** Computed cost in tokens (carried to postIntercept). */
  readonly computedCost: number;
  /** Resolved user ID (carried to postIntercept). */
  readonly userId: string;
  /** Trust tier escalation, if any. */
  readonly trustEscalation?: ApprovalTier;
}

/**
 * Economy Plugin for PolicyGateway integration.
 *
 * Provides pre/post intercept hooks that enforce budget limits,
 * check token balances, evaluate trust, and bill allowed actions.
 *
 * @example
 * ```ts
 * const plugin = new EconomyPlugin({
 *   balancePort: new InMemoryBalanceAdapter(),
 *   budgetPort: new InMemoryBudgetAdapter(),
 *   trustPort: new InMemoryTrustAdapter(),
 * });
 *
 * // In gateway config:
 * const gateway = new PolicyGateway({
 *   resolveToken: ...,
 *   economyPlugin: {
 *     preIntercept: (req) => plugin.preIntercept(req),
 *     postIntercept: (req, decision) => plugin.postIntercept(req, decision),
 *   },
 * });
 * ```
 */
export class EconomyPlugin {
  private readonly config: EconomyPluginConfig;
  private readonly ledger: EconomyLedgerEmitter | null;
  /** Cache: agentId → last PreInterceptResult for postIntercept. */
  private readonly preInterceptCache = new Map<string, PreInterceptResult>();

  constructor(config: EconomyPluginConfig) {
    this.config = config;
    this.ledger = config.emitLedgerEvent
      ? new EconomyLedgerEmitter(config.emitLedgerEvent)
      : null;
  }

  /**
   * Pre-intercept hook. Called BEFORE PolicyGateway assigns tiers.
   *
   * Checks budget, balance, and trust. Returns a PolicyDecision
   * to short-circuit, or undefined to let the gateway proceed.
   *
   * On any port error, returns undefined (fail-open).
   */
  async preIntercept(request: SintRequest): Promise<PolicyDecision | undefined> {
    try {
      const userId = await this.resolveUserId(request.agentId);

      // 1. Compute action cost
      let costMultiplier = 1.0;
      if (this.config.pricingPort) {
        const priceResult = await this.config.pricingPort.getPrice({
          actionType: request.action,
          resource: request.resource,
        });
        if (priceResult.ok) {
          costMultiplier = priceResult.value.costMultiplier;
        }
      }
      const pricing = computeActionCost(request, costMultiplier);

      // 2. Budget check
      const budgetResult = await this.config.budgetPort.checkBudget({
        userId,
        action: request.action,
        resource: request.resource,
        estimatedCost: pricing.totalCost,
      });

      if (budgetResult.ok) {
        this.ledger?.budgetChecked(request.agentId, request.tokenId, {
          userId,
          estimatedCost: pricing.totalCost,
          remainingBudget: budgetResult.value.remainingBudget,
          allowed: budgetResult.value.allowed,
        });

        if (!budgetResult.value.allowed) {
          this.ledger?.budgetExceeded(request.agentId, request.tokenId, {
            userId,
            estimatedCost: pricing.totalCost,
            remainingBudget: budgetResult.value.remainingBudget,
          });
          return this.denyDecision(
            request,
            "BUDGET_EXCEEDED",
            new BudgetExceededError(
              userId,
              pricing.totalCost,
              budgetResult.value.remainingBudget,
            ).message,
          );
        }

        // Budget alert emission
        if (budgetResult.value.isAlert) {
          this.ledger?.budgetAlert(request.agentId, request.tokenId, {
            userId,
            usagePercent: budgetResult.value.usagePercent,
            remainingBudget: budgetResult.value.remainingBudget,
          });
        }
      }
      // Budget port error → fail-open

      // 3. Balance check
      const balanceResult = await this.config.balancePort.getBalance(userId);
      if (balanceResult.ok) {
        this.ledger?.balanceChecked(request.agentId, request.tokenId, {
          userId,
          balance: balanceResult.value.balance,
          requiredTokens: pricing.totalCost,
        });

        if (balanceResult.value.balance < pricing.totalCost) {
          this.ledger?.balanceInsufficient(request.agentId, request.tokenId, {
            userId,
            required: pricing.totalCost,
            available: balanceResult.value.balance,
          });
          return this.denyDecision(
            request,
            "INSUFFICIENT_BALANCE",
            new InsufficientBalanceError(
              userId,
              pricing.totalCost,
              balanceResult.value.balance,
            ).message,
          );
        }
      }
      // Balance port error → fail-open

      // 4. Trust evaluation
      let trustEscalation: ApprovalTier | undefined;
      const trustResult = await this.config.trustPort.evaluateTrust({
        userId,
        agentId: request.agentId,
        action: request.action,
        resource: request.resource,
      });

      if (trustResult.ok) {
        const mappedTier = mapTrustLevelToApprovalTier(trustResult.value.trustLevel);

        this.ledger?.trustEvaluated(request.agentId, request.tokenId, {
          userId,
          trustLevel: trustResult.value.trustLevel,
          score: trustResult.value.score,
          mappedTier: mappedTier,
        });

        if (mappedTier === null) {
          // Blocked
          this.ledger?.trustBlocked(request.agentId, request.tokenId, {
            userId,
            trustLevel: trustResult.value.trustLevel,
            reason: trustResult.value.reason,
          });
          return this.denyDecision(
            request,
            "TRUST_BLOCKED",
            new TrustBlockedError(
              userId,
              trustResult.value.trustLevel,
              trustResult.value.reason,
            ).message,
          );
        }

        // Store escalation for gateway to apply
        trustEscalation = mappedTier;
      }
      // Trust port error → fail-open

      // Cache result for postIntercept
      this.preInterceptCache.set(request.requestId, {
        computedCost: pricing.totalCost,
        userId,
        trustEscalation,
      });

      // No short-circuit — let the gateway proceed
      return undefined;
    } catch {
      // Any unexpected error → fail-open
      return undefined;
    }
  }

  /**
   * Post-intercept hook. Called AFTER PolicyGateway makes a decision.
   *
   * If the decision is "allow", bills the action by withdrawing
   * tokens from the user's balance.
   *
   * On any error, silently fails (the allow decision stands).
   */
  async postIntercept(
    request: SintRequest,
    decision: PolicyDecision,
  ): Promise<void> {
    // Only bill on allow
    if (decision.action !== "allow") {
      this.preInterceptCache.delete(request.requestId);
      return;
    }

    const cached = this.preInterceptCache.get(request.requestId);
    this.preInterceptCache.delete(request.requestId);

    if (!cached) {
      // preIntercept didn't run or failed — skip billing
      return;
    }

    try {
      const { userId, computedCost } = cached;
      const description = `SINT action: ${request.action} on ${request.resource}`;

      const withdrawResult = await this.config.balancePort.withdraw(
        userId,
        computedCost,
        description,
        "sint_protocol",
      );

      if (withdrawResult.ok) {
        this.ledger?.balanceDeducted(request.agentId, request.tokenId, {
          userId,
          tokens: computedCost,
          newBalance: withdrawResult.value.balance,
          description,
        });

        this.ledger?.actionBilled(request.agentId, request.tokenId, {
          userId,
          tokens: computedCost,
          action: request.action,
          resource: request.resource,
          baseCost: computeActionCost(request).baseCost,
          costMultiplier: computeActionCost(request).costMultiplier,
          globalMarkup: computeActionCost(request).globalMarkup,
        });
      }
    } catch {
      // Billing failure → fail-open (action already allowed)
    }
  }

  /**
   * Get the trust escalation tier from the last preIntercept, if any.
   * Used by the gateway to merge with the security tier.
   */
  getTrustEscalation(requestId: string): ApprovalTier | undefined {
    return this.preInterceptCache.get(requestId)?.trustEscalation;
  }

  // ─── Internal ──────────────────────────────────────────────

  private async resolveUserId(agentId: string): Promise<string> {
    if (this.config.resolveUserId) {
      return this.config.resolveUserId(agentId);
    }
    return agentId;
  }

  private denyDecision(
    request: SintRequest,
    policyViolated: string,
    reason: string,
  ): PolicyDecision {
    return {
      requestId: request.requestId,
      timestamp: new Date().toISOString(),
      action: "deny",
      denial: { reason, policyViolated },
      assignedTier: "T3_commit" as ApprovalTier,
      assignedRisk: "T3_irreversible" as RiskTier,
    };
  }
}
