import { describe, expect, it, vi } from "vitest";
import { ApprovalTier, type KineticEnvelopeResult, type SintRequest } from "@pshkv/core";
import { generateKeypair, issueCapabilityToken } from "@pshkv/gate-capability-tokens";
import type { SintCapabilityToken } from "@pshkv/core";
import { PolicyGateway } from "../src/gateway.js";
import { assignTier } from "../src/tier-assigner.js";

const root = generateKeypair();
const agent = generateKeypair();

function futureISO(): string {
  return new Date(Date.now() + 3_600_000).toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

function makeRequest(overrides: Partial<SintRequest> = {}): SintRequest {
  return {
    requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
    timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    agentId: "a".repeat(64),
    tokenId: "01905f7c-0000-7000-8000-000000000000",
    resource: "ros2:///camera/front",
    action: "subscribe",
    params: {},
    ...overrides,
  };
}

function envelope(supervision: KineticEnvelopeResult["supervision"]): KineticEnvelopeResult {
  return {
    autonomyDemand: 0.2,
    environmentalCapacity: 1,
    margin: supervision === "silent_veto" ? -0.1 : 0.4,
    capacityKnown: true,
    tightenedConstraints: {},
    supervision,
    rationale: ["kinetic supervision floor"],
  };
}

function makeToken(): SintCapabilityToken {
  const issued = issueCapabilityToken({
    issuer: root.publicKey,
    subject: agent.publicKey,
    resource: "ros2:///camera/front",
    actions: ["subscribe", "publish"],
    constraints: {},
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    expiresAt: futureISO(),
    revocable: false,
  }, root.privateKey);
  if (!issued.ok) throw new Error("token issuance failed");
  return issued.value;
}

function gatewayRequest(token: SintCapabilityToken): SintRequest {
  return makeRequest({
    agentId: agent.publicKey,
    tokenId: token.tokenId,
  });
}

describe("kinetic supervision floor", () => {
  it("leaves the tier unchanged when supervision is stable or unset", () => {
    const baseline = assignTier(makeRequest());
    expect(baseline.approvalTier).toBe(ApprovalTier.T0_OBSERVE);
    expect(assignTier(makeRequest(), { supervision: "stable" }).approvalTier).toBe(ApprovalTier.T0_OBSERVE);
  });

  it("floors a T0 action at T1 for metacognitive, T2 for assisted, and T3 for regulated", () => {
    expect(assignTier(makeRequest(), { supervision: "metacognitive" }).approvalTier).toBe(ApprovalTier.T1_PREPARE);
    const assisted = assignTier(makeRequest(), { supervision: "assisted" });
    expect(assisted.approvalTier).toBe(ApprovalTier.T2_ACT);
    expect(assisted.escalationReasons).toContain("Kinetic envelope supervision floor");
    expect(assignTier(makeRequest(), { supervision: "regulated" }).approvalTier).toBe(ApprovalTier.T3_COMMIT);
  });

  it("does not lower a higher tier", () => {
    const act = makeRequest({ resource: "ros2:///cmd_vel", action: "publish" });
    expect(assignTier(act).approvalTier).toBe(ApprovalTier.T2_ACT);
    expect(assignTier(act, { supervision: "metacognitive" }).approvalTier).toBe(ApprovalTier.T2_ACT);
    expect(assignTier(act, { supervision: "regulated" }).approvalTier).toBe(ApprovalTier.T3_COMMIT);
    expect(assignTier(makeRequest({ resource: "ros2:///mode_change", action: "call" }), {
      supervision: "assisted",
    }).approvalTier).toBe(ApprovalTier.T3_COMMIT);
  });

  it("does not change the gateway decision when no kinetic plugin is registered", async () => {
    const token = makeToken();
    const decision = await new PolicyGateway({ resolveToken: () => token }).intercept(gatewayRequest(token));
    expect(decision.action).toBe("allow");
    expect(decision.assignedTier).toBe(ApprovalTier.T0_OBSERVE);
  });

  it("keeps a stable plugin result on the original tier", async () => {
    const token = makeToken();
    const decision = await new PolicyGateway({
      resolveToken: () => token,
      kineticEnvelope: { computeEnvelope: vi.fn().mockResolvedValue(envelope("stable")) },
    }).intercept(gatewayRequest(token));
    expect(decision.action).toBe("allow");
    expect(decision.assignedTier).toBe(ApprovalTier.T0_OBSERVE);
  });

  it("escalates an otherwise allowed action when the plugin returns assisted", async () => {
    const token = makeToken();
    const decision = await new PolicyGateway({
      resolveToken: () => token,
      kineticEnvelope: { computeEnvelope: vi.fn().mockResolvedValue(envelope("assisted")) },
    }).intercept(gatewayRequest(token));
    expect(decision.action).toBe("escalate");
    expect(decision.assignedTier).toBe(ApprovalTier.T2_ACT);
  });

  it("denies a silent veto with KINETIC_CAPACITY_EXCEEDED", async () => {
    const token = makeToken();
    const decision = await new PolicyGateway({
      resolveToken: () => token,
      kineticEnvelope: { computeEnvelope: vi.fn().mockResolvedValue(envelope("silent_veto")) },
    }).intercept(gatewayRequest(token));
    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("KINETIC_CAPACITY_EXCEEDED");
  });

  it("denies when the kinetic plugin throws", async () => {
    const token = makeToken();
    const decision = await new PolicyGateway({
      resolveToken: () => token,
      kineticEnvelope: { computeEnvelope: vi.fn().mockRejectedValue(new Error("envelope offline")) },
    }).intercept(gatewayRequest(token));
    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("KINETIC_ENVELOPE_UNAVAILABLE");
  });
});
