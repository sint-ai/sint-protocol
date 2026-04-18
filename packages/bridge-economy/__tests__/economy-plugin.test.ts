import { describe, it, expect, vi } from "vitest";
import type { SintRequest, PolicyDecision } from "@pshkv/core";
import { ApprovalTier, RiskTier } from "@pshkv/core";
import { EconomyPlugin } from "../src/economy-plugin.js";
import type { EconomyPluginConfig } from "../src/economy-plugin.js";
import { InMemoryBalanceAdapter } from "../src/adapters/in-memory-balance-adapter.js";
import { InMemoryBudgetAdapter } from "../src/adapters/in-memory-budget-adapter.js";
import { InMemoryTrustAdapter } from "../src/adapters/in-memory-trust-adapter.js";
import { InMemoryPricingAdapter } from "../src/adapters/in-memory-pricing-adapter.js";

function makeRequest(overrides: Partial<SintRequest> = {}): SintRequest {
  return {
    requestId: "req-001",
    timestamp: "2026-03-17T10:00:00.000000Z",
    agentId: "agent-abc",
    tokenId: "token-001",
    resource: "mcp://tool/test",
    action: "call",
    params: {},
    ...overrides,
  };
}

function makePlugin(overrides?: Partial<EconomyPluginConfig>): EconomyPlugin {
  return new EconomyPlugin({
    balancePort: new InMemoryBalanceAdapter(250),
    budgetPort: new InMemoryBudgetAdapter(1000),
    trustPort: new InMemoryTrustAdapter("unrestricted"),
    ...overrides,
  });
}

function makeAllowDecision(requestId = "req-001"): PolicyDecision {
  return {
    requestId,
    timestamp: new Date().toISOString(),
    action: "allow",
    assignedTier: ApprovalTier.T0_OBSERVE,
    assignedRisk: RiskTier.T0_READ,
  };
}

function makeDenyDecision(requestId = "req-001"): PolicyDecision {
  return {
    requestId,
    timestamp: new Date().toISOString(),
    action: "deny",
    denial: { reason: "test deny", policyViolated: "TEST" },
    assignedTier: ApprovalTier.T3_COMMIT,
    assignedRisk: RiskTier.T3_IRREVERSIBLE,
  };
}

function makeEscalateDecision(requestId = "req-001"): PolicyDecision {
  return {
    requestId,
    timestamp: new Date().toISOString(),
    action: "escalate",
    escalation: {
      requiredTier: ApprovalTier.T2_ACT,
      reason: "needs review",
      timeoutMs: 30000,
      fallbackAction: "deny",
    },
    assignedTier: ApprovalTier.T2_ACT,
    assignedRisk: RiskTier.T2_STATEFUL,
  };
}

describe("EconomyPlugin", () => {
  describe("preIntercept", () => {
    it("returns undefined (proceed) for a valid request", async () => {
      const plugin = makePlugin();
      const req = makeRequest();
      const decision = await plugin.preIntercept(req);
      expect(decision).toBeUndefined();
    });

    it("returns deny for budget exceeded", async () => {
      const budget = new InMemoryBudgetAdapter(5);
      const plugin = makePlugin({ budgetPort: budget });
      const req = makeRequest();
      // Default MCP call costs 9 tokens, budget is only 5
      const decision = await plugin.preIntercept(req);
      expect(decision).toBeDefined();
      expect(decision!.action).toBe("deny");
      expect(decision!.denial?.policyViolated).toBe("BUDGET_EXCEEDED");
    });

    it("returns deny for insufficient balance", async () => {
      const balance = new InMemoryBalanceAdapter(0);
      const plugin = makePlugin({ balancePort: balance });
      const req = makeRequest();
      const decision = await plugin.preIntercept(req);
      expect(decision).toBeDefined();
      expect(decision!.action).toBe("deny");
      expect(decision!.denial?.policyViolated).toBe("INSUFFICIENT_BALANCE");
    });

    it("returns deny for trust blocked", async () => {
      const trust = new InMemoryTrustAdapter("blocked");
      const plugin = makePlugin({ trustPort: trust });
      const req = makeRequest();
      const decision = await plugin.preIntercept(req);
      expect(decision).toBeDefined();
      expect(decision!.action).toBe("deny");
      expect(decision!.denial?.policyViolated).toBe("TRUST_BLOCKED");
    });

    it("records trust escalation for high_risk agent", async () => {
      const trust = new InMemoryTrustAdapter("high_risk");
      const plugin = makePlugin({ trustPort: trust });
      const req = makeRequest();
      const decision = await plugin.preIntercept(req);
      // Should not deny -- high_risk maps to T3_COMMIT, not blocked
      expect(decision).toBeUndefined();
      const escalation = plugin.getTrustEscalation(req.requestId);
      expect(escalation).toBe(ApprovalTier.T3_COMMIT);
    });

    it("fails open on budget port error", async () => {
      const badBudget = {
        checkBudget: vi.fn().mockRejectedValue(new Error("connection refused")),
      };
      const plugin = makePlugin({ budgetPort: badBudget as any });
      const req = makeRequest();
      const decision = await plugin.preIntercept(req);
      // fail-open: returns undefined so gateway proceeds
      expect(decision).toBeUndefined();
    });

    it("fails open on balance port error", async () => {
      const badBalance = {
        getBalance: vi.fn().mockRejectedValue(new Error("timeout")),
        withdraw: vi.fn().mockRejectedValue(new Error("timeout")),
        deposit: vi.fn().mockRejectedValue(new Error("timeout")),
      };
      const plugin = makePlugin({ balancePort: badBalance as any });
      const req = makeRequest();
      const decision = await plugin.preIntercept(req);
      expect(decision).toBeUndefined();
    });

    it("fails open on trust port error", async () => {
      const badTrust = {
        evaluateTrust: vi.fn().mockRejectedValue(new Error("service down")),
      };
      const plugin = makePlugin({ trustPort: badTrust as any });
      const req = makeRequest();
      const decision = await plugin.preIntercept(req);
      expect(decision).toBeUndefined();
    });
  });

  describe("postIntercept", () => {
    it("bills on allow decision", async () => {
      const balance = new InMemoryBalanceAdapter(250);
      const plugin = makePlugin({ balancePort: balance });
      const req = makeRequest();

      await plugin.preIntercept(req);
      await plugin.postIntercept(req, makeAllowDecision());

      const balResult = await balance.getBalance("agent-abc");
      expect(balResult.ok).toBe(true);
      if (balResult.ok) {
        // 250 - 9 = 241
        expect(balResult.value.balance).toBe(241);
      }
    });

    it("does NOT bill on deny decision", async () => {
      const balance = new InMemoryBalanceAdapter(250);
      const plugin = makePlugin({ balancePort: balance });
      const req = makeRequest();

      await plugin.preIntercept(req);
      await plugin.postIntercept(req, makeDenyDecision());

      const balResult = await balance.getBalance("agent-abc");
      expect(balResult.ok).toBe(true);
      if (balResult.ok) {
        expect(balResult.value.balance).toBe(250);
      }
    });

    it("does NOT bill on escalate decision", async () => {
      const balance = new InMemoryBalanceAdapter(250);
      const plugin = makePlugin({ balancePort: balance });
      const req = makeRequest();

      await plugin.preIntercept(req);
      await plugin.postIntercept(req, makeEscalateDecision());

      const balResult = await balance.getBalance("agent-abc");
      expect(balResult.ok).toBe(true);
      if (balResult.ok) {
        expect(balResult.value.balance).toBe(250);
      }
    });

    it("fails open on withdraw error during billing", async () => {
      const balance = new InMemoryBalanceAdapter(250);
      const plugin = makePlugin({ balancePort: balance });
      const req = makeRequest();

      await plugin.preIntercept(req);

      // Sabotage the withdraw method after preIntercept cached the result
      balance.withdraw = vi.fn().mockRejectedValue(new Error("write timeout"));

      // Should not throw -- fail-open
      await expect(
        plugin.postIntercept(req, makeAllowDecision()),
      ).resolves.toBeUndefined();
    });
  });

  describe("configuration and integration", () => {
    it("custom resolveUserId is called", async () => {
      const resolveUserId = vi.fn().mockResolvedValue("resolved-user-42");
      const balance = new InMemoryBalanceAdapter(250);
      const plugin = makePlugin({ resolveUserId, balancePort: balance });
      const req = makeRequest();

      await plugin.preIntercept(req);

      expect(resolveUserId).toHaveBeenCalledWith("agent-abc");
    });

    it("pricing port multiplier affects computed cost", async () => {
      const pricing = new InMemoryPricingAdapter(2.0);
      const balance = new InMemoryBalanceAdapter(250);
      const plugin = makePlugin({ pricingPort: pricing, balancePort: balance });
      const req = makeRequest();

      await plugin.preIntercept(req);
      await plugin.postIntercept(req, makeAllowDecision());

      const balResult = await balance.getBalance("agent-abc");
      expect(balResult.ok).toBe(true);
      if (balResult.ok) {
        // ceil(6 * 2.0 * 1.5) = 18; 250 - 18 = 232
        expect(balResult.value.balance).toBe(232);
      }
    });

    it("getTrustEscalation returns correct tier", async () => {
      const trust = new InMemoryTrustAdapter("medium_risk");
      const plugin = makePlugin({ trustPort: trust });
      const req = makeRequest();

      await plugin.preIntercept(req);

      const escalation = plugin.getTrustEscalation(req.requestId);
      expect(escalation).toBe(ApprovalTier.T2_ACT);
    });

    it("multiple sequential calls decrement balance correctly", async () => {
      const balance = new InMemoryBalanceAdapter(250);
      const plugin = makePlugin({ balancePort: balance });

      // First call
      const req1 = makeRequest({ requestId: "req-001" });
      await plugin.preIntercept(req1);
      await plugin.postIntercept(req1, makeAllowDecision("req-001"));

      // Second call
      const req2 = makeRequest({ requestId: "req-002" });
      await plugin.preIntercept(req2);
      await plugin.postIntercept(req2, makeAllowDecision("req-002"));

      // Third call
      const req3 = makeRequest({ requestId: "req-003" });
      await plugin.preIntercept(req3);
      await plugin.postIntercept(req3, makeAllowDecision("req-003"));

      const balResult = await balance.getBalance("agent-abc");
      expect(balResult.ok).toBe(true);
      if (balResult.ok) {
        // 250 - 9 - 9 - 9 = 223
        expect(balResult.value.balance).toBe(223);
      }
    });

    it("budget alert is emitted when usage > 80%", async () => {
      const mockEmit = vi.fn();
      const budget = new InMemoryBudgetAdapter(100);
      budget.setUsage("agent-abc", 85);
      const plugin = makePlugin({
        budgetPort: budget,
        emitLedgerEvent: mockEmit,
      });
      const req = makeRequest();

      await plugin.preIntercept(req);

      const alertCall = mockEmit.mock.calls.find(
        (call: unknown[]) => (call[0] as { eventType: string }).eventType === "economy.budget.alert",
      );
      expect(alertCall).toBeDefined();
      const alertPayload = (alertCall![0] as { payload: { usagePercent: number } }).payload;
      expect(alertPayload.usagePercent).toBe(85);
    });

    it("ledger events are emitted for each check", async () => {
      const mockEmit = vi.fn();
      const plugin = makePlugin({ emitLedgerEvent: mockEmit });
      const req = makeRequest();

      await plugin.preIntercept(req);

      const eventTypes = mockEmit.mock.calls.map(
        (call: unknown[]) => (call[0] as { eventType: string }).eventType,
      );
      expect(eventTypes).toContain("economy.budget.checked");
      expect(eventTypes).toContain("economy.balance.checked");
      expect(eventTypes).toContain("economy.trust.evaluated");
    });
  });
});
