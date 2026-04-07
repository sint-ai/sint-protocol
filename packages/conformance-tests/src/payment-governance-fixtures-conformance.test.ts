/**
 * Payment governance fixture conformance.
 *
 * Validates Economic Layer v1 safety controls:
 * - per-agent daily budget cap
 * - rolling window spend cap
 * - recipient allowlist enforcement
 * - receipt replay rejection
 * - reserve/commit settlement consistency
 */

import { describe, expect, it } from "vitest";
import {
  loadPaymentGovernanceFixture,
  type PaymentGovernanceFixture,
} from "./fixture-loader.js";

type DecisionReason = PaymentGovernanceFixture["cases"][number]["expected"]["reason"];

interface LedgerTx {
  readonly tokens: number;
  readonly atMs: number;
}

class PaymentGovernanceHarness {
  private usedTodayTokens = 0;
  private readonly rolling: LedgerTx[] = [];
  private readonly reserved = new Set<string>();
  private readonly seenReceipts = new Set<string>();

  constructor(
    private readonly cfg: PaymentGovernanceFixture["defaults"],
    setup?: PaymentGovernanceFixture["cases"][number]["setup"],
  ) {
    this.usedTodayTokens = setup?.usedTodayTokens ?? 0;
    const now = Date.now();
    for (const tx of setup?.priorTxsInWindow ?? []) {
      this.rolling.push({ tokens: tx.tokens, atMs: now + tx.atOffsetMs });
    }
    for (const id of setup?.reserveOnlyTxIds ?? []) {
      this.reserved.add(id);
    }
    for (const id of setup?.usedReceiptIds ?? []) {
      this.seenReceipts.add(id);
    }
  }

  private prune(nowMs: number): void {
    const cutoff = nowMs - this.cfg.rollingWindowMs;
    for (let i = this.rolling.length - 1; i >= 0; i -= 1) {
      if (this.rolling[i] && this.rolling[i]!.atMs < cutoff) {
        this.rolling.splice(i, 1);
      }
    }
  }

  private rollingSum(nowMs: number): number {
    this.prune(nowMs);
    return this.rolling.reduce((sum, tx) => sum + tx.tokens, 0);
  }

  reserve(input: PaymentGovernanceFixture["cases"][number]["payment"]): DecisionReason {
    const now = Date.now();

    if (!this.cfg.approvedRecipients.includes(input.recipient)) {
      return "RECIPIENT_NOT_ALLOWLISTED";
    }
    if (input.receiptId && this.seenReceipts.has(input.receiptId)) {
      return "RECEIPT_REPLAY";
    }
    if (this.usedTodayTokens + input.tokens > this.cfg.dailyBudgetTokens) {
      return "BUDGET_EXCEEDED";
    }
    if (this.rollingSum(now) + input.tokens > this.cfg.rollingWindowCapTokens) {
      return "ROLLING_WINDOW_EXCEEDED";
    }

    this.reserved.add(input.txId);
    return "ALLOW";
  }

  commit(input: PaymentGovernanceFixture["cases"][number]["payment"]): DecisionReason {
    if (!this.reserved.has(input.txId)) {
      return "SETTLEMENT_MISMATCH";
    }
    this.reserved.delete(input.txId);
    this.usedTodayTokens += input.tokens;
    this.rolling.push({ tokens: input.tokens, atMs: Date.now() });
    if (input.receiptId) {
      this.seenReceipts.add(input.receiptId);
    }
    return "ALLOW";
  }
}

describe("Payment Governance Fixture Conformance", () => {
  const fixture = loadPaymentGovernanceFixture();

  it("fixture has required shape", () => {
    expect(fixture.fixtureId).toBeTypeOf("string");
    expect(fixture.defaults.dailyBudgetTokens).toBeGreaterThan(0);
    expect(fixture.defaults.rollingWindowMs).toBeGreaterThan(0);
    expect(fixture.defaults.rollingWindowCapTokens).toBeGreaterThan(0);
    expect(fixture.defaults.approvedRecipients.length).toBeGreaterThan(0);
    expect(fixture.cases.length).toBeGreaterThanOrEqual(5);
  });

  it("enforces payment governance controls deterministically", () => {
    for (const scenario of fixture.cases) {
      const harness = new PaymentGovernanceHarness(fixture.defaults, scenario.setup);
      let result: DecisionReason = "ALLOW";

      if (scenario.flow.reserve) {
        result = harness.reserve(scenario.payment);
        if (result !== "ALLOW") {
          expect(scenario.expected.allowed).toBe(false);
          expect(result).toBe(scenario.expected.reason);
          continue;
        }
      }

      if (scenario.flow.commit) {
        result = harness.commit(scenario.payment);
      }

      expect(result === "ALLOW").toBe(scenario.expected.allowed);
      expect(result).toBe(scenario.expected.reason);
    }
  });
});
