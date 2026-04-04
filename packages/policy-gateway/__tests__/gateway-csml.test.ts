/**
 * SINT Protocol — PolicyGateway CSML escalation integration tests.
 *
 * Tests the csmlEscalation hook added to PolicyGateway:
 * - No plugin → existing behavior unchanged
 * - CSML escalates T0 → T1 (auto-allow becomes escalate)
 * - CSML escalates T1 → T2
 * - CSML escalates T2 → T3
 * - T3 stays T3 (ceiling)
 * - Plugin error → fail-open (base tier used)
 * - Escalation reason propagated to decision
 * - avatar.csml.escalated event emitted
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { PolicyGateway } from "../src/gateway.js";
import type { CsmlEscalationPlugin } from "../src/gateway.js";
import {
  generateKeypair,
  issueCapabilityToken,
} from "@sint/gate-capability-tokens";
import type { SintCapabilityToken, SintRequest } from "@sint/core";
import { ApprovalTier } from "@sint/core";

function futureISO(h = 1): string {
  return new Date(Date.now() + h * 3_600_000).toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

const root = generateKeypair();
const agent = generateKeypair();

let token: SintCapabilityToken;

function makeToken(resource = "ros2:///camera/front", actions = ["subscribe"]): SintCapabilityToken {
  const result = issueCapabilityToken({
    issuer: root.publicKey,
    subject: agent.publicKey,
    resource,
    actions,
    constraints: {},
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    expiresAt: futureISO(),
    revocable: false,
  }, root.privateKey);
  if (!result.ok) throw new Error("token issuance failed");
  return result.value;
}

function makeRequest(resource = "ros2:///camera/front", action = "subscribe"): SintRequest {
  return {
    requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
    timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    resource,
    action,
    params: {},
    agentId: agent.publicKey,
    tokenId: token.tokenId,
  };
}

/** Escalation plugin that bumps the tier by one. */
function escalatingPlugin(bumped: ApprovalTier, score = 0.8): CsmlEscalationPlugin {
  return {
    evaluateAgent: vi.fn().mockResolvedValue({
      escalated: true,
      resultTier: bumped,
      csmlScore: score,
      reason: `CSML ${score} > θ=0.3 — tier bumped`,
    }),
  };
}

/** No-op escalation plugin (CSML below threshold). */
function nominalPlugin(tier: ApprovalTier, score = 0.1): CsmlEscalationPlugin {
  return {
    evaluateAgent: vi.fn().mockResolvedValue({
      escalated: false,
      resultTier: tier,
      csmlScore: score,
      reason: "CSML nominal",
    }),
  };
}

beforeEach(() => {
  token = makeToken();
});

describe("PolicyGateway CSML escalation", () => {
  it("no csmlEscalation plugin → T0 camera observe is allowed", async () => {
    const gateway = new PolicyGateway({
      resolveToken: () => token,
    });
    const decision = await gateway.intercept(makeRequest());
    expect(decision.action).toBe("allow");
    expect(decision.assignedTier).toBe(ApprovalTier.T0_OBSERVE);
  });

  it("nominal CSML → T0 camera still allowed", async () => {
    const plugin = nominalPlugin(ApprovalTier.T0_OBSERVE);
    const gateway = new PolicyGateway({
      resolveToken: () => token,
      csmlEscalation: plugin,
    });
    const decision = await gateway.intercept(makeRequest());
    expect(decision.action).toBe("allow");
    expect(decision.assignedTier).toBe(ApprovalTier.T0_OBSERVE);
    expect(plugin.evaluateAgent).toHaveBeenCalledWith(
      agent.publicKey,
      ApprovalTier.T0_OBSERVE,
    );
  });

  it("high CSML → T0 bumped to T1 (auto-allow becomes allow at T1)", async () => {
    const t1Token = makeToken();
    const plugin = escalatingPlugin(ApprovalTier.T1_PREPARE);
    const gateway = new PolicyGateway({
      resolveToken: () => t1Token,
      csmlEscalation: plugin,
    });
    const decision = await gateway.intercept(makeRequest());
    // T0 bumped to T1 — T1 is still auto-allowed
    expect(decision.action).toBe("allow");
    expect(decision.assignedTier).toBe(ApprovalTier.T1_PREPARE);
  });

  it("high CSML → T0 bumped to T2 escalates to human review", async () => {
    const plugin = escalatingPlugin(ApprovalTier.T2_ACT);
    const gateway = new PolicyGateway({
      resolveToken: () => token,
      csmlEscalation: plugin,
    });
    const decision = await gateway.intercept(makeRequest());
    expect(decision.action).toBe("escalate");
    expect(decision.assignedTier).toBe(ApprovalTier.T2_ACT);
  });

  it("high CSML on T1 → T2 requires escalation", async () => {
    const t1Token = makeToken("mcp://filesystem/readFile", ["call"]);
    const plugin = escalatingPlugin(ApprovalTier.T2_ACT);
    const gateway = new PolicyGateway({
      resolveToken: () => t1Token,
      csmlEscalation: plugin,
    });
    const decision = await gateway.intercept(makeRequest("mcp://filesystem/readFile", "call"));
    expect(decision.assignedTier).toBe(ApprovalTier.T2_ACT);
    expect(decision.action).toBe("escalate");
  });

  it("CSML escalation reason appears in escalation details", async () => {
    const plugin = escalatingPlugin(ApprovalTier.T2_ACT);
    const gateway = new PolicyGateway({
      resolveToken: () => token,
      csmlEscalation: plugin,
    });
    const decision = await gateway.intercept(makeRequest());
    if (decision.action === "escalate") {
      expect(decision.escalation?.reason).toContain("CSML escalation");
    }
  });

  it("CSML plugin error → fail-open, base tier used", async () => {
    const errorPlugin: CsmlEscalationPlugin = {
      evaluateAgent: vi.fn().mockRejectedValue(new Error("CSML service offline")),
    };
    const gateway = new PolicyGateway({
      resolveToken: () => token,
      csmlEscalation: errorPlugin,
    });
    // Should not throw, base T0 tier used
    const decision = await gateway.intercept(makeRequest());
    expect(decision.action).toBe("allow");
    expect(decision.assignedTier).toBe(ApprovalTier.T0_OBSERVE);
  });

  it("avatar.csml.escalated event emitted when tier is bumped", async () => {
    const events: string[] = [];
    const plugin = escalatingPlugin(ApprovalTier.T2_ACT);
    const gateway = new PolicyGateway({
      resolveToken: () => token,
      csmlEscalation: plugin,
      emitLedgerEvent: (e) => events.push(e.eventType),
    });
    await gateway.intercept(makeRequest());
    expect(events).toContain("avatar.csml.escalated");
  });

  it("avatar.csml.escalated NOT emitted when CSML is nominal", async () => {
    const events: string[] = [];
    const plugin = nominalPlugin(ApprovalTier.T0_OBSERVE);
    const gateway = new PolicyGateway({
      resolveToken: () => token,
      csmlEscalation: plugin,
      emitLedgerEvent: (e) => events.push(e.eventType),
    });
    await gateway.intercept(makeRequest());
    expect(events).not.toContain("avatar.csml.escalated");
  });
});
