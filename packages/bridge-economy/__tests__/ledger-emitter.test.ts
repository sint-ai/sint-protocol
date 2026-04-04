import { describe, it, expect, vi } from "vitest";
import { EconomyLedgerEmitter } from "../src/ledger-emitter.js";

function createEmitter() {
  const mockEmit = vi.fn();
  const emitter = new EconomyLedgerEmitter(mockEmit);
  return { emitter, mockEmit };
}

describe("EconomyLedgerEmitter", () => {
  it("balanceChecked emits economy.balance.checked", () => {
    const { emitter, mockEmit } = createEmitter();
    const payload = { userId: "user-1", balance: 250, requiredTokens: 9 };
    emitter.balanceChecked("agent-1", "token-1", payload);

    expect(mockEmit).toHaveBeenCalledOnce();
    expect(mockEmit).toHaveBeenCalledWith({
      eventType: "economy.balance.checked",
      agentId: "agent-1",
      tokenId: "token-1",
      payload,
    });
  });

  it("balanceDeducted emits economy.balance.deducted", () => {
    const { emitter, mockEmit } = createEmitter();
    const payload = { userId: "user-1", tokens: 9, newBalance: 241, description: "MCP call" };
    emitter.balanceDeducted("agent-1", "token-1", payload);

    expect(mockEmit).toHaveBeenCalledOnce();
    expect(mockEmit).toHaveBeenCalledWith({
      eventType: "economy.balance.deducted",
      agentId: "agent-1",
      tokenId: "token-1",
      payload,
    });
  });

  it("balanceInsufficient emits economy.balance.insufficient", () => {
    const { emitter, mockEmit } = createEmitter();
    const payload = { userId: "user-1", required: 9, available: 0 };
    emitter.balanceInsufficient("agent-1", "token-1", payload);

    expect(mockEmit).toHaveBeenCalledOnce();
    expect(mockEmit).toHaveBeenCalledWith({
      eventType: "economy.balance.insufficient",
      agentId: "agent-1",
      tokenId: "token-1",
      payload,
    });
  });

  it("budgetChecked emits economy.budget.checked", () => {
    const { emitter, mockEmit } = createEmitter();
    const payload = { userId: "user-1", estimatedCost: 9, remainingBudget: 991, allowed: true };
    emitter.budgetChecked("agent-1", "token-1", payload);

    expect(mockEmit).toHaveBeenCalledOnce();
    expect(mockEmit).toHaveBeenCalledWith({
      eventType: "economy.budget.checked",
      agentId: "agent-1",
      tokenId: "token-1",
      payload,
    });
  });

  it("trustEvaluated emits economy.trust.evaluated", () => {
    const { emitter, mockEmit } = createEmitter();
    const payload = { userId: "user-1", trustLevel: "unrestricted", score: 1.0, mappedTier: "T0_observe" };
    emitter.trustEvaluated("agent-1", "token-1", payload);

    expect(mockEmit).toHaveBeenCalledOnce();
    expect(mockEmit).toHaveBeenCalledWith({
      eventType: "economy.trust.evaluated",
      agentId: "agent-1",
      tokenId: "token-1",
      payload,
    });
  });

  it("actionBilled emits economy.action.billed", () => {
    const { emitter, mockEmit } = createEmitter();
    const payload = {
      userId: "user-1",
      tokens: 9,
      action: "call",
      resource: "mcp://tool/test",
      baseCost: 6,
      costMultiplier: 1.0,
      globalMarkup: 1.5,
    };
    emitter.actionBilled("agent-1", "token-1", payload);

    expect(mockEmit).toHaveBeenCalledOnce();
    expect(mockEmit).toHaveBeenCalledWith({
      eventType: "economy.action.billed",
      agentId: "agent-1",
      tokenId: "token-1",
      payload,
    });
  });
});
