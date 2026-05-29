/**
 * Agent commerce governance fixture conformance.
 *
 * Covers task-market and x402-style pre-action controls:
 * - registered agent identity
 * - scoped market capabilities
 * - task-mode state transitions
 * - reputation gates for exclusive claims
 * - auction bid validity
 * - benchmark proof evidence
 * - x402 permit cap and expiry
 * - settlement state and receipt replay checks
 */

import { describe, expect, it } from "vitest";
import {
  loadAgentCommerceGovernanceFixture,
  type AgentCommerceDecision,
  type AgentCommerceDecisionReason,
  type AgentCommerceGovernanceCase,
  type AgentCommerceGovernanceFixture,
} from "./fixture-loader.js";

interface AgentCommerceDecisionResult {
  readonly decision: AgentCommerceDecision;
  readonly reason: AgentCommerceDecisionReason;
  readonly requiredTier?: string;
  readonly nextStatus?: string;
  readonly evidenceRequired: boolean;
}

class AgentCommerceGovernanceHarness {
  private readonly registeredAgents: Set<string>;
  private readonly allowedRecipients: Set<string>;
  private readonly usedSettlementReceiptIds: Set<string>;
  private readonly referenceTimeMs: number;

  constructor(private readonly fixture: AgentCommerceGovernanceFixture) {
    this.registeredAgents = new Set(fixture.defaults.registeredAgents);
    this.allowedRecipients = new Set(fixture.defaults.allowedRecipients);
    this.usedSettlementReceiptIds = new Set(fixture.defaults.usedSettlementReceiptIds);
    this.referenceTimeMs = Date.parse(fixture.defaults.referenceTime);
  }

  evaluate(scenario: AgentCommerceGovernanceCase): AgentCommerceDecisionResult {
    if (!this.registeredAgents.has(scenario.principal)) {
      return this.deny("AGENT_IDENTITY_REQUIRED");
    }

    if (!this.hasScope(scenario)) {
      return this.deny("SCOPE_NOT_AUTHORIZED");
    }

    const { request } = scenario;

    if (request.x402) {
      return this.evaluateX402(request.x402);
    }

    if (request.settlement) {
      return this.evaluateSettlement(scenario);
    }

    const task = request.task;
    if (!task) {
      return this.deny("STATE_TRANSITION_INVALID");
    }

    if (request.action === "create") {
      if (!this.allowedRecipients.has(task.recipient ?? "")) {
        return this.deny("RECIPIENT_NOT_ALLOWLISTED");
      }
      if (task.rewardUsdc >= this.fixture.defaults.highValueApprovalThresholdUsdc) {
        return {
          decision: "escalate",
          reason: "VALUE_REQUIRES_APPROVAL",
          requiredTier: "T3_COMMIT",
          nextStatus: "open",
          evidenceRequired: true,
        };
      }
      return this.allow("open");
    }

    if (request.action === "claim") {
      if (task.status !== "open" || task.mode !== "claim") {
        return this.deny("STATE_TRANSITION_INVALID");
      }
      const reputation = this.fixture.defaults.reputationByAgent[scenario.principal] ?? 0;
      if (reputation < this.fixture.defaults.minReputationScore) {
        return this.deny("REPUTATION_BELOW_THRESHOLD");
      }
      return this.allow("claimed");
    }

    if (request.action === "pitch") {
      if (task.status !== "open" || task.mode !== "pitch") {
        return this.deny("STATE_TRANSITION_INVALID");
      }
      return this.allow("open");
    }

    if (request.action === "select_worker") {
      if (task.status !== "open" || task.mode !== "pitch" || !task.selectedWorker) {
        return this.deny("STATE_TRANSITION_INVALID");
      }
      return {
        decision: "allow",
        reason: "ALLOW",
        nextStatus: "worker_selected",
        evidenceRequired: true,
      };
    }

    if (request.action === "bid") {
      if (task.status !== "open" || task.mode !== "auction") {
        return this.deny("STATE_TRANSITION_INVALID");
      }
      if (task.auctionType === "english" && request.bid) {
        const currentLowest = task.currentLowestBidUsdc ?? task.maxPriceUsdc ?? Infinity;
        if (request.bid.priceUsdc >= currentLowest) {
          return this.deny("BID_NOT_COMPETITIVE");
        }
      }
      return this.allow();
    }

    if (request.action === "submit_proof") {
      if (task.mode !== "benchmark" || task.status !== "open") {
        return this.deny("STATE_TRANSITION_INVALID");
      }
      if (!request.proof?.digest || request.proof.metricValue === undefined) {
        return this.deny("PROOF_REQUIRED");
      }
      return this.allow("pending_approval");
    }

    if (request.action === "accept") {
      if (task.status !== "pending_approval" || !task.selectedWorker) {
        return this.deny("STATE_TRANSITION_INVALID");
      }
      if (task.rewardUsdc >= this.fixture.defaults.highValueApprovalThresholdUsdc) {
        return {
          decision: "escalate",
          reason: "VALUE_REQUIRES_APPROVAL",
          requiredTier: "T3_COMMIT",
          nextStatus: "accepted",
          evidenceRequired: true,
        };
      }
      return {
        decision: "allow",
        reason: "ALLOW",
        nextStatus: "accepted",
        evidenceRequired: true,
      };
    }

    return this.deny("STATE_TRANSITION_INVALID");
  }

  private evaluateX402(
    x402: NonNullable<AgentCommerceGovernanceCase["request"]["x402"]>,
  ): AgentCommerceDecisionResult {
    if (!this.allowedRecipients.has(x402.recipient)) {
      return this.deny("RECIPIENT_NOT_ALLOWLISTED");
    }
    if (x402.permitCapUsdc > this.fixture.defaults.maxX402SessionCapUsdc) {
      return this.deny("X402_CAP_EXCEEDED");
    }

    const expiresAtMs = Date.parse(x402.expiresAt);
    const maxExpiryMs =
      this.referenceTimeMs + this.fixture.defaults.maxPermitExpiryMinutes * 60_000;

    if (expiresAtMs <= this.referenceTimeMs || expiresAtMs > maxExpiryMs) {
      return this.deny("X402_PERMIT_EXPIRED");
    }

    return this.allow();
  }

  private evaluateSettlement(scenario: AgentCommerceGovernanceCase): AgentCommerceDecisionResult {
    const { task, settlement } = scenario.request;
    if (!task || !settlement) {
      return this.deny("SETTLEMENT_STATE_INVALID");
    }
    if (task.status !== "accepted") {
      return this.deny("SETTLEMENT_STATE_INVALID");
    }
    if (!this.allowedRecipients.has(settlement.recipient)) {
      return this.deny("RECIPIENT_NOT_ALLOWLISTED");
    }
    if (this.usedSettlementReceiptIds.has(settlement.receiptId)) {
      return this.deny("RECEIPT_REPLAY");
    }
    this.usedSettlementReceiptIds.add(settlement.receiptId);
    return {
      decision: "allow",
      reason: "ALLOW",
      nextStatus: "settled",
      evidenceRequired: true,
    };
  }

  private hasScope(scenario: AgentCommerceGovernanceCase): boolean {
    const { capability, request } = scenario;
    return (
      capability.actions.includes(request.action) &&
      capability.resources.some((resource) => resourceMatches(resource, request.resource))
    );
  }

  private allow(nextStatus?: string): AgentCommerceDecisionResult {
    return {
      decision: "allow",
      reason: "ALLOW",
      nextStatus,
      evidenceRequired: false,
    };
  }

  private deny(reason: AgentCommerceDecisionReason): AgentCommerceDecisionResult {
    return {
      decision: "deny",
      reason,
      evidenceRequired: true,
    };
  }
}

function resourceMatches(pattern: string, resource: string): boolean {
  if (pattern.endsWith("*")) {
    return resource.startsWith(pattern.slice(0, -1));
  }
  return pattern === resource;
}

describe("Agent Commerce Governance Fixture Conformance", () => {
  const fixture = loadAgentCommerceGovernanceFixture();

  it("fixture exposes the v1 market and payment control vocabulary", () => {
    expect(fixture.fixtureId).toBe("sint.economy.agent-commerce-governance.v1");
    expect(fixture.profile.resources).toEqual([
      "market://task/*",
      "market://settlement/*",
      "x402://session/*",
    ]);
    expect(fixture.profile.taskModes).toEqual([
      "bounty",
      "claim",
      "pitch",
      "benchmark",
      "auction",
    ]);
    expect(fixture.profile.actions).toContain("authorize_permit");
    expect(fixture.profile.actions).toContain("release");
    expect(fixture.profile.decisionReasons).toContain("X402_CAP_EXCEEDED");
    expect(fixture.profile.decisionReasons).toContain("BID_NOT_COMPETITIVE");
    expect(fixture.cases.length).toBeGreaterThanOrEqual(10);
  });

  it("keeps every case tied to a stable decision reason and evidence rule", () => {
    for (const scenario of fixture.cases) {
      expect(fixture.profile.decisionReasons).toContain(scenario.expected.reason);
      if (scenario.expected.decision !== "allow" || scenario.request.action === "release") {
        expect(scenario.expected.evidenceRequired).toBe(true);
      }
      if (scenario.request.action === "submit_proof" && scenario.request.task?.mode === "benchmark") {
        expect(scenario.request.proof?.type).toBe("benchmark");
      }
    }
  });

  it("evaluates task-market and x402 controls deterministically", () => {
    const harness = new AgentCommerceGovernanceHarness(fixture);

    for (const scenario of fixture.cases) {
      const result = harness.evaluate(scenario);
      expect(result).toEqual(scenario.expected);
    }
  });
});
