import { describe, expect, it, vi } from "vitest";
import type { KineticEnvelopeResult, KineticTightenedConstraints, SintCapabilityToken, SintRequest } from "@pshkv/core";
import { ApprovalTier } from "@pshkv/core";
import { generateKeypair, issueCapabilityToken } from "@pshkv/gate-capability-tokens";
import { PolicyGateway } from "../src/gateway.js";

const root = generateKeypair();
const agent = generateKeypair();

function futureISO(): string {
  return new Date(Date.now() + 3_600_000).toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

function makeToken(constraints: SintCapabilityToken["constraints"]): SintCapabilityToken {
  const issued = issueCapabilityToken({
    issuer: root.publicKey,
    subject: agent.publicKey,
    resource: "ros2:///camera/front",
    actions: ["subscribe"],
    constraints,
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    expiresAt: futureISO(),
    revocable: false,
  }, root.privateKey);
  if (!issued.ok) throw new Error("token issuance failed");
  return issued.value;
}

function request(token: SintCapabilityToken, params: SintRequest["params"]): SintRequest {
  return {
    requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
    timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    agentId: agent.publicKey,
    tokenId: token.tokenId,
    resource: "ros2:///camera/front",
    action: "subscribe",
    params,
  };
}

function plugin(tightenedConstraints: KineticTightenedConstraints) {
  const result: KineticEnvelopeResult = {
    autonomyDemand: 0.2,
    environmentalCapacity: 1,
    margin: 0.8,
    capacityKnown: true,
    tightenedConstraints,
    supervision: "stable",
    rationale: ["kinetic tightened constraints"],
  };
  return { computeEnvelope: vi.fn().mockResolvedValue(result) };
}

describe("kinetic tightened-constraint min-merge", () => {
  it("denies a command the token allows when the kinetic velocity limit is tighter", async () => {
    const token = makeToken({ maxVelocityMps: 2 });
    const decision = await new PolicyGateway({
      resolveToken: () => token,
      kineticEnvelope: plugin({ maxVelocityMps: 1 }),
    }).intercept(request(token, { velocity: 1.5 }));
    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("CONSTRAINT_VIOLATION");
    expect(decision.denial?.reason).toContain("exceeds limit 1m/s");
  });

  it("does not raise the token velocity limit when the kinetic limit is looser", async () => {
    const token = makeToken({ maxVelocityMps: 1 });
    const decision = await new PolicyGateway({
      resolveToken: () => token,
      kineticEnvelope: plugin({ maxVelocityMps: 2 }),
    }).intercept(request(token, { velocity: 1.5 }));
    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("CONSTRAINT_VIOLATION");
    expect(decision.denial?.reason).toContain("exceeds limit 1m/s");
  });

  it("allows a command under both the token and kinetic velocity limits", async () => {
    const token = makeToken({ maxVelocityMps: 2 });
    const decision = await new PolicyGateway({
      resolveToken: () => token,
      kineticEnvelope: plugin({ maxVelocityMps: 1 }),
    }).intercept(request(token, { velocity: 0.5 }));
    expect(decision.action).toBe("allow");
    expect(decision.assignedTier).toBe(ApprovalTier.T0_OBSERVE);
  });

  it("denies a command the token allows when the kinetic force limit is tighter", async () => {
    const token = makeToken({ maxForceNewtons: 100 });
    const decision = await new PolicyGateway({
      resolveToken: () => token,
      kineticEnvelope: plugin({ maxForceNewtons: 40 }),
    }).intercept(request(token, { force: 50 }));
    expect(decision.action).toBe("deny");
    expect(decision.denial?.reason).toContain("exceeds limit 40N");
  });

  it("denies a command the token allows when the kinetic torque limit is tighter", async () => {
    const token = makeToken({ maxTorqueNm: 10 });
    const decision = await new PolicyGateway({
      resolveToken: () => token,
      kineticEnvelope: plugin({ maxTorqueNm: 4 }),
    }).intercept(request(token, { torque: 6 }));
    expect(decision.action).toBe("deny");
    expect(decision.denial?.reason).toContain("exceeds limit 4Nm");
  });

  it("denies a command the token allows when the kinetic jerk limit is tighter", async () => {
    const token = makeToken({ maxJerkMps3: 8 });
    const decision = await new PolicyGateway({
      resolveToken: () => token,
      kineticEnvelope: plugin({ maxJerkMps3: 3 }),
    }).intercept(request(token, { jerk: 5 }));
    expect(decision.action).toBe("deny");
    expect(decision.denial?.reason).toContain("exceeds limit 3m/s");
  });

  it("denies a command the token allows when the kinetic angular limit is tighter", async () => {
    const token = makeToken({ maxAngularVelocityRps: 2 });
    const decision = await new PolicyGateway({
      resolveToken: () => token,
      kineticEnvelope: plugin({ maxAngularVelocityRps: 0.5 }),
    }).intercept(request(token, { angular_velocity: 1 }));
    expect(decision.action).toBe("deny");
    expect(decision.denial?.reason).toContain("exceeds limit 0.5rad/s");
  });

  it("leaves a token-legal command allowed when no kinetic plugin is registered", async () => {
    const token = makeToken({ maxVelocityMps: 2 });
    const decision = await new PolicyGateway({
      resolveToken: () => token,
    }).intercept(request(token, { velocity: 1.5 }));
    expect(decision.action).toBe("allow");
  });
});
