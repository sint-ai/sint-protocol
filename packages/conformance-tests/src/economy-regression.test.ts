/**
 * SINT Protocol — Economy Regression Test Suite.
 *
 * End-to-end tests verifying the bridge-economy integration with
 * PolicyGateway using in-memory adapters. These tests encode the
 * economic invariants that SINT must enforce:
 *
 * 1. Allowed actions are billed (tokens deducted)
 * 2. Budget/balance checks block before security checks
 * 3. Trust levels escalate approval tiers correctly
 * 4. Economic events appear in the Evidence Ledger
 * 5. Phase 1/2 behavior is unchanged without economy plugin
 * 6. Billing formula matches the product API constants
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  generateKeypair,
  issueCapabilityToken,
  RevocationStore,
} from "@sint/gate-capability-tokens";
import { PolicyGateway } from "@sint/gate-policy-gateway";
import { LedgerWriter } from "@sint/gate-evidence-ledger";
import type {
  SintCapabilityToken,
  SintCapabilityTokenRequest,
  SintRequest,
  SintEventType,
} from "@sint/core";
import { ApprovalTier } from "@sint/core";
import {
  EconomyPlugin,
  InMemoryBalanceAdapter,
  InMemoryBudgetAdapter,
  InMemoryTrustAdapter,
  InMemoryPricingAdapter,
  computeActionCost,
  BASE_TOOL_CALL_COST,
  GLOBAL_MARKUP_MULTIPLIER,
} from "@sint/bridge-economy";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

function makeRequest(
  overrides: Partial<SintRequest> & { tokenId: string; agentId: string },
): SintRequest {
  return {
    requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
    timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    resource: "ros2:///camera/front",
    action: "subscribe",
    params: {},
    ...overrides,
  };
}

describe("SINT Economy Regression Tests", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  const revocationStore = new RevocationStore();
  let tokenStore: Map<string, SintCapabilityToken>;
  let ledger: LedgerWriter;
  let emitSpy: ReturnType<typeof vi.fn>;

  let balanceAdapter: InMemoryBalanceAdapter;
  let budgetAdapter: InMemoryBudgetAdapter;
  let trustAdapter: InMemoryTrustAdapter;

  beforeEach(() => {
    tokenStore = new Map();
    revocationStore.clear();
    ledger = new LedgerWriter();

    emitSpy = vi.fn((event: { eventType: string; agentId: string; tokenId?: string; payload: Record<string, unknown> }) => {
      ledger.append({
        eventType: event.eventType as SintEventType,
        agentId: event.agentId,
        tokenId: event.tokenId,
        payload: event.payload,
      });
    });

    balanceAdapter = new InMemoryBalanceAdapter(250);
    budgetAdapter = new InMemoryBudgetAdapter(1000);
    trustAdapter = new InMemoryTrustAdapter("unrestricted");
  });

  function issueAndStore(overrides?: Partial<SintCapabilityTokenRequest>): SintCapabilityToken {
    const request: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "ros2:///camera/front",
      actions: ["subscribe"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(12),
      revocable: true,
      ...overrides,
    };
    const result = issueCapabilityToken(request, root.privateKey);
    if (!result.ok) throw new Error(`Token issuance failed: ${result.error}`);
    tokenStore.set(result.value.tokenId, result.value);
    return result.value;
  }

  function makeGatewayWithEconomy(): PolicyGateway {
    const economyPlugin = new EconomyPlugin({
      balancePort: balanceAdapter,
      budgetPort: budgetAdapter,
      trustPort: trustAdapter,
      emitLedgerEvent: emitSpy,
    });

    return new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      revocationStore,
      emitLedgerEvent: emitSpy,
      economyPlugin: {
        preIntercept: (req) => economyPlugin.preIntercept(req),
        postIntercept: (req, decision) => economyPlugin.postIntercept(req, decision),
      },
    });
  }

  function makeGatewayWithoutEconomy(): PolicyGateway {
    return new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      revocationStore,
      emitLedgerEvent: emitSpy,
    });
  }

  // ── 1. Allowed action → tokens deducted ──

  it("allowed action deducts tokens equal to computed cost", async () => {
    const gateway = makeGatewayWithEconomy();
    const token = issueAndStore();

    const decision = await gateway.intercept(
      makeRequest({ agentId: agent.publicKey, tokenId: token.tokenId }),
    );

    expect(decision.action).toBe("allow");

    // Check balance was deducted
    const balance = await balanceAdapter.getBalance(agent.publicKey);
    expect(balance.ok).toBe(true);
    if (balance.ok) {
      // Default ROS2 subscribe = BASE_ROS2_PUBLISH_COST but camera/subscribe → T0
      // Actually computeActionCost with ros2:// resource → BASE_ROS2_PUBLISH_COST = 8
      // Total = ceil(8 × 1.0 × 1.5) = 12 tokens
      expect(balance.value.balance).toBe(250 - 12);
    }
  });

  // ── 2. Denied by budget → no billing ──

  it("budget exceeded denies without billing", async () => {
    budgetAdapter.setUsage(agent.publicKey, 999); // Nearly full budget

    const gateway = makeGatewayWithEconomy();
    const token = issueAndStore();

    const decision = await gateway.intercept(
      makeRequest({ agentId: agent.publicKey, tokenId: token.tokenId }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("BUDGET_EXCEEDED");

    // Balance should not change
    const balance = await balanceAdapter.getBalance(agent.publicKey);
    expect(balance.ok).toBe(true);
    if (balance.ok) {
      expect(balance.value.balance).toBe(250);
    }
  });

  // ── 3. Trust blocked → gateway deny ──

  it("trust blocked agent is denied", async () => {
    trustAdapter.setTrustLevel(agent.publicKey, "blocked");

    const gateway = makeGatewayWithEconomy();
    const token = issueAndStore();

    const decision = await gateway.intercept(
      makeRequest({ agentId: agent.publicKey, tokenId: token.tokenId }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("TRUST_BLOCKED");
  });

  // ── 4. Trust high_risk → T3 escalation on T0 resource ──

  it("high_risk trust escalates T0 resource to T3", async () => {
    trustAdapter.setTrustLevel(agent.publicKey, "high_risk");

    const economyPlugin = new EconomyPlugin({
      balancePort: balanceAdapter,
      budgetPort: budgetAdapter,
      trustPort: trustAdapter,
      emitLedgerEvent: emitSpy,
    });

    // preIntercept should succeed (not blocked) but record T3 escalation
    const token = issueAndStore();
    const request = makeRequest({ agentId: agent.publicKey, tokenId: token.tokenId });
    const preResult = await economyPlugin.preIntercept(request);

    // high_risk → T3_COMMIT tier, but preIntercept doesn't deny (only "blocked" denies)
    expect(preResult).toBeUndefined();
    const escalation = economyPlugin.getTrustEscalation(request.requestId);
    expect(escalation).toBe(ApprovalTier.T3_COMMIT);
  });

  // ── 5. Trust unrestricted → T0 auto-approve ──

  it("unrestricted trust allows T0 auto-approve", async () => {
    trustAdapter.setTrustLevel(agent.publicKey, "unrestricted");

    const gateway = makeGatewayWithEconomy();
    const token = issueAndStore();

    const decision = await gateway.intercept(
      makeRequest({ agentId: agent.publicKey, tokenId: token.tokenId }),
    );

    expect(decision.action).toBe("allow");
    expect(decision.assignedTier).toBe(ApprovalTier.T0_OBSERVE);
  });

  // ── 6. Zero balance → deny ──

  it("zero balance denies action", async () => {
    balanceAdapter.setBalance(agent.publicKey, 0);

    const gateway = makeGatewayWithEconomy();
    const token = issueAndStore();

    const decision = await gateway.intercept(
      makeRequest({ agentId: agent.publicKey, tokenId: token.tokenId }),
    );

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("INSUFFICIENT_BALANCE");
  });

  // ── 7. postIntercept failure → action still allowed (fail-open) ──

  it("postIntercept billing failure does not revoke the allow decision", async () => {
    // Create a balance adapter that fails on withdraw
    const failingBalance: InMemoryBalanceAdapter = new InMemoryBalanceAdapter(250);
    const originalWithdraw = failingBalance.withdraw.bind(failingBalance);
    failingBalance.withdraw = async () => {
      throw new Error("Balance service down");
    };

    const economyPlugin = new EconomyPlugin({
      balancePort: failingBalance,
      budgetPort: budgetAdapter,
      trustPort: trustAdapter,
      emitLedgerEvent: emitSpy,
    });

    const gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      revocationStore,
      emitLedgerEvent: emitSpy,
      economyPlugin: {
        preIntercept: (req) => economyPlugin.preIntercept(req),
        postIntercept: (req, dec) => economyPlugin.postIntercept(req, dec),
      },
    });

    const token = issueAndStore();

    const decision = await gateway.intercept(
      makeRequest({ agentId: agent.publicKey, tokenId: token.tokenId }),
    );

    // Should still be "allow" even though billing failed
    expect(decision.action).toBe("allow");
  });

  // ── 8. Economy plugin absent → Phase 1/2 behavior unchanged ──

  it("gateway without economy plugin behaves identically to Phase 1/2", async () => {
    const gwWithout = makeGatewayWithoutEconomy();
    const gwWith = makeGatewayWithEconomy();

    const token = issueAndStore();
    const request = makeRequest({ agentId: agent.publicKey, tokenId: token.tokenId });

    const decisionWithout = await gwWithout.intercept(request);
    const decisionWith = await gwWith.intercept(request);

    // Both should allow
    expect(decisionWithout.action).toBe("allow");
    expect(decisionWith.action).toBe("allow");

    // Same tier assignment
    expect(decisionWithout.assignedTier).toBe(decisionWith.assignedTier);
  });

  // ── 9. Billing formula matches API constants (9 tokens default) ──

  it("default MCP tool call costs 9 tokens (6 × 1.0 × 1.5)", () => {
    const request: SintRequest = {
      requestId: "test",
      timestamp: new Date().toISOString(),
      agentId: "test",
      tokenId: "test",
      resource: "mcp://server/tool",
      action: "call",
      params: {},
    };

    const pricing = computeActionCost(request);
    expect(pricing.baseCost).toBe(BASE_TOOL_CALL_COST); // 6
    expect(pricing.costMultiplier).toBe(1.0);
    expect(pricing.globalMarkup).toBe(GLOBAL_MARKUP_MULTIPLIER); // 1.5
    expect(pricing.totalCost).toBe(9); // ceil(6 × 1.0 × 1.5)
  });

  // ── 10. Multiple sequential actions → balance decrements correctly ──

  it("multiple sequential actions decrement balance correctly", async () => {
    const gateway = makeGatewayWithEconomy();

    // Subscribe to camera — ROS2 resource, cost = 12 tokens
    const token1 = issueAndStore();
    await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token1.tokenId,
        requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a1" as any,
      }),
    );

    // Second request — same cost
    const token2 = issueAndStore();
    await gateway.intercept(
      makeRequest({
        agentId: agent.publicKey,
        tokenId: token2.tokenId,
        requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a2" as any,
      }),
    );

    const balance = await balanceAdapter.getBalance(agent.publicKey);
    expect(balance.ok).toBe(true);
    if (balance.ok) {
      // 250 - 12 - 12 = 226
      expect(balance.value.balance).toBe(226);
    }
  });

  // ── 11. Trust+budget both deny → budget deny takes precedence ──

  it("budget exceeded takes precedence over trust blocked", async () => {
    budgetAdapter.setUsage(agent.publicKey, 999); // Budget exceeded
    trustAdapter.setTrustLevel(agent.publicKey, "blocked"); // Also blocked

    const gateway = makeGatewayWithEconomy();
    const token = issueAndStore();

    const decision = await gateway.intercept(
      makeRequest({ agentId: agent.publicKey, tokenId: token.tokenId }),
    );

    // Budget check comes first
    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("BUDGET_EXCEEDED");
  });

  // ── 12. Economic events appear in ledger ──

  it("economic events are recorded in the evidence ledger", async () => {
    const gateway = makeGatewayWithEconomy();
    const token = issueAndStore();

    await gateway.intercept(
      makeRequest({ agentId: agent.publicKey, tokenId: token.tokenId }),
    );

    const allEvents = ledger.getAll();
    const economyEvents = allEvents.filter((e) =>
      e.eventType.startsWith("economy."),
    );

    // Should have at least: budget.checked, balance.checked, trust.evaluated,
    // balance.deducted, action.billed
    expect(economyEvents.length).toBeGreaterThanOrEqual(3);

    const eventTypes = new Set(economyEvents.map((e) => e.eventType));
    expect(eventTypes.has("economy.budget.checked")).toBe(true);
    expect(eventTypes.has("economy.balance.checked")).toBe(true);
    expect(eventTypes.has("economy.trust.evaluated")).toBe(true);
  });

  // ── 13. Ledger hash-chain integrity with economic events ──

  it("ledger chain is valid with economic events included", async () => {
    const gateway = makeGatewayWithEconomy();
    const token = issueAndStore();

    await gateway.intercept(
      makeRequest({ agentId: agent.publicKey, tokenId: token.tokenId }),
    );

    // Verify the chain
    const chainResult = ledger.verifyChain();
    expect(chainResult.ok).toBe(true);
  });

  // ── 14. In-memory adapters satisfy all interface contracts ──

  it("in-memory adapters satisfy balance, budget, trust contracts", async () => {
    // Balance
    const bal = await balanceAdapter.getBalance("user1");
    expect(bal.ok).toBe(true);
    if (bal.ok) expect(bal.value.balance).toBe(250);

    const wd = await balanceAdapter.withdraw("user1", 10, "test", "test");
    expect(wd.ok).toBe(true);
    if (wd.ok) expect(wd.value.balance).toBe(240);

    const dep = await balanceAdapter.deposit("user1", 5, "test", "test");
    expect(dep.ok).toBe(true);
    if (dep.ok) expect(dep.value.balance).toBe(245);

    // Budget
    const bud = await budgetAdapter.checkBudget({
      userId: "user1", action: "call", resource: "test", estimatedCost: 10,
    });
    expect(bud.ok).toBe(true);
    if (bud.ok) expect(bud.value.allowed).toBe(true);

    // Trust
    const trust = await trustAdapter.evaluateTrust({
      userId: "user1", agentId: "agent1", action: "call", resource: "test",
    });
    expect(trust.ok).toBe(true);
    if (trust.ok) expect(trust.value.trustLevel).toBe("unrestricted");
  });

  // ── 15. Budget alert emission ──

  it("budget alert is emitted when usage exceeds 80%", async () => {
    budgetAdapter.setUsage(agent.publicKey, 820); // 82% of 1000

    const gateway = makeGatewayWithEconomy();
    const token = issueAndStore();

    await gateway.intercept(
      makeRequest({ agentId: agent.publicKey, tokenId: token.tokenId }),
    );

    // Check for budget alert event
    const allEvents = ledger.getAll();
    const alertEvents = allEvents.filter(
      (e) => e.eventType === "economy.budget.alert",
    );
    expect(alertEvents.length).toBeGreaterThanOrEqual(1);
  });
});
