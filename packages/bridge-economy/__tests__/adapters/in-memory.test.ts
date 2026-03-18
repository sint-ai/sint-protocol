import { describe, it, expect } from "vitest";
import { InMemoryBalanceAdapter } from "../../src/adapters/in-memory-balance-adapter.js";
import { InMemoryBudgetAdapter } from "../../src/adapters/in-memory-budget-adapter.js";
import { InMemoryTrustAdapter } from "../../src/adapters/in-memory-trust-adapter.js";
import { InMemoryPricingAdapter } from "../../src/adapters/in-memory-pricing-adapter.js";

describe("InMemoryBalanceAdapter", () => {
  it("getBalance returns default balance of 250", async () => {
    const adapter = new InMemoryBalanceAdapter(250);
    const result = await adapter.getBalance("user-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.balance).toBe(250);
      expect(result.value.userId).toBe("user-1");
    }
  });

  it("withdraw reduces balance", async () => {
    const adapter = new InMemoryBalanceAdapter(250);
    const result = await adapter.withdraw("user-1", 9, "MCP call", "sint_protocol");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.balance).toBe(241);
    }
  });

  it("withdraw fails on insufficient balance", async () => {
    const adapter = new InMemoryBalanceAdapter(5);
    const result = await adapter.withdraw("user-1", 9, "MCP call", "sint_protocol");
    expect(result.ok).toBe(false);
  });

  it("deposit increases balance", async () => {
    const adapter = new InMemoryBalanceAdapter(250);
    const result = await adapter.deposit("user-1", 100, "top-up", "manual");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.balance).toBe(350);
    }
  });
});

describe("InMemoryBudgetAdapter", () => {
  it("checkBudget allows action within budget limit", async () => {
    const adapter = new InMemoryBudgetAdapter(1000);
    const result = await adapter.checkBudget({
      userId: "user-1",
      action: "call",
      resource: "mcp://tool/test",
      estimatedCost: 9,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.allowed).toBe(true);
      expect(result.value.remainingBudget).toBe(1000);
    }
  });

  it("checkBudget denies action over budget limit", async () => {
    const adapter = new InMemoryBudgetAdapter(5);
    const result = await adapter.checkBudget({
      userId: "user-1",
      action: "call",
      resource: "mcp://tool/test",
      estimatedCost: 9,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.allowed).toBe(false);
    }
  });

  it("isAlert is true when usage >= 80%", async () => {
    const adapter = new InMemoryBudgetAdapter(100);
    adapter.setUsage("user-1", 85);
    const result = await adapter.checkBudget({
      userId: "user-1",
      action: "call",
      resource: "mcp://tool/test",
      estimatedCost: 5,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.isAlert).toBe(true);
      expect(result.value.usagePercent).toBe(85);
    }
  });
});

describe("InMemoryTrustAdapter", () => {
  it("evaluateTrust returns default trust level", async () => {
    const adapter = new InMemoryTrustAdapter("low_risk");
    const result = await adapter.evaluateTrust({
      userId: "user-1",
      agentId: "agent-1",
      action: "call",
      resource: "mcp://tool/test",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.trustLevel).toBe("low_risk");
    }
  });

  it("setTrustLevel changes the trust level for an agent", async () => {
    const adapter = new InMemoryTrustAdapter("unrestricted");
    adapter.setTrustLevel("agent-1", "high_risk");
    const result = await adapter.evaluateTrust({
      userId: "user-1",
      agentId: "agent-1",
      action: "call",
      resource: "mcp://tool/test",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.trustLevel).toBe("high_risk");
    }
  });
});

describe("InMemoryPricingAdapter", () => {
  it("getPrice returns default multiplier of 1.0", async () => {
    const adapter = new InMemoryPricingAdapter();
    const result = await adapter.getPrice({
      actionType: "call",
      resource: "mcp://tool/test",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.costMultiplier).toBe(1.0);
    }
  });

  it("setCostMultiplier changes the price for a resource", async () => {
    const adapter = new InMemoryPricingAdapter();
    adapter.setCostMultiplier("mcp://tool/premium", 3.0);
    const result = await adapter.getPrice({
      actionType: "call",
      resource: "mcp://tool/premium",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.costMultiplier).toBe(3.0);
    }
  });
});
