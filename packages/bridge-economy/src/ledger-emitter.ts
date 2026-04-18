/**
 * SINT Protocol — Economy Ledger Emitter.
 *
 * Typed helpers for emitting economic events to the Evidence Ledger.
 * All 9 new economic event types have dedicated emit methods with
 * structured payloads.
 *
 * @module @sint/bridge-economy/ledger-emitter
 */

import type { SintEventType } from "@sint-ai/core";
import type { LedgerEmitter } from "@sint-ai/gate-policy-gateway";

/**
 * Typed emitter for economy-related ledger events.
 *
 * Wraps a generic LedgerEmitter with methods for each economic
 * event type, ensuring consistent payload structure.
 *
 * @example
 * ```ts
 * const emitter = new EconomyLedgerEmitter(ledgerEmit);
 * emitter.balanceDeducted("agent123", "token456", {
 *   userId: "user1", tokens: 9, newBalance: 241, description: "MCP call"
 * });
 * ```
 */
export class EconomyLedgerEmitter {
  private readonly emit: LedgerEmitter;

  constructor(emitLedgerEvent: LedgerEmitter) {
    this.emit = emitLedgerEvent;
  }

  // ─── Balance Events ────────────────────────────────────────

  /** Emit when a balance check is performed. */
  balanceChecked(
    agentId: string,
    tokenId: string | undefined,
    payload: { userId: string; balance: number; requiredTokens: number },
  ): void {
    this.emitTyped("economy.balance.checked", agentId, tokenId, payload);
  }

  /** Emit when tokens are deducted from a balance. */
  balanceDeducted(
    agentId: string,
    tokenId: string | undefined,
    payload: { userId: string; tokens: number; newBalance: number; description: string },
  ): void {
    this.emitTyped("economy.balance.deducted", agentId, tokenId, payload);
  }

  /** Emit when a balance check fails (insufficient funds). */
  balanceInsufficient(
    agentId: string,
    tokenId: string | undefined,
    payload: { userId: string; required: number; available: number },
  ): void {
    this.emitTyped("economy.balance.insufficient", agentId, tokenId, payload);
  }

  // ─── Budget Events ─────────────────────────────────────────

  /** Emit when a budget check is performed. */
  budgetChecked(
    agentId: string,
    tokenId: string | undefined,
    payload: { userId: string; estimatedCost: number; remainingBudget: number; allowed: boolean },
  ): void {
    this.emitTyped("economy.budget.checked", agentId, tokenId, payload);
  }

  /** Emit when a budget limit is exceeded. */
  budgetExceeded(
    agentId: string,
    tokenId: string | undefined,
    payload: { userId: string; estimatedCost: number; remainingBudget: number },
  ): void {
    this.emitTyped("economy.budget.exceeded", agentId, tokenId, payload);
  }

  /** Emit when budget usage approaches the limit (>80%). */
  budgetAlert(
    agentId: string,
    tokenId: string | undefined,
    payload: { userId: string; usagePercent: number; remainingBudget: number },
  ): void {
    this.emitTyped("economy.budget.alert", agentId, tokenId, payload);
  }

  // ─── Trust Events ──────────────────────────────────────────

  /** Emit when trust is evaluated for an action. */
  trustEvaluated(
    agentId: string,
    tokenId: string | undefined,
    payload: { userId: string; trustLevel: string; score: number; mappedTier: string | null },
  ): void {
    this.emitTyped("economy.trust.evaluated", agentId, tokenId, payload);
  }

  /** Emit when trust evaluation blocks an action. */
  trustBlocked(
    agentId: string,
    tokenId: string | undefined,
    payload: { userId: string; trustLevel: string; reason: string },
  ): void {
    this.emitTyped("economy.trust.blocked", agentId, tokenId, payload);
  }

  // ─── Billing Events ────────────────────────────────────────

  /** Emit when an action is billed (tokens deducted after allow). */
  actionBilled(
    agentId: string,
    tokenId: string | undefined,
    payload: {
      userId: string;
      tokens: number;
      action: string;
      resource: string;
      baseCost: number;
      costMultiplier: number;
      globalMarkup: number;
    },
  ): void {
    this.emitTyped("economy.action.billed", agentId, tokenId, payload);
  }

  // ─── Internal ──────────────────────────────────────────────

  private emitTyped(
    eventType: SintEventType,
    agentId: string,
    tokenId: string | undefined,
    payload: Record<string, unknown>,
  ): void {
    this.emit({ eventType, agentId, tokenId, payload });
  }
}
