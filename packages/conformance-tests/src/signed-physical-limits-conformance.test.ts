import { describe, expect, it } from "vitest";
import type { SintPhysicalConstraints, SintRequest } from "@pshkv/core";
import { generateKeypair, generateUUIDv7, issueCapabilityToken } from "@pshkv/gate-capability-tokens";
import { PolicyGateway } from "@pshkv/gate-policy-gateway";

const issuer = generateKeypair();
const agent = generateKeypair();

async function decisionFor(constraints: SintPhysicalConstraints, params: Record<string, unknown>,
  physicalContext?: SintRequest["physicalContext"]) {
  const issued = issueCapabilityToken({
    issuer: issuer.publicKey,
    subject: agent.publicKey,
    resource: "ros2:///cmd_vel",
    actions: ["publish"],
    constraints,
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    revocable: false,
  }, issuer.privateKey);
  if (!issued.ok) throw new Error(issued.error);
  const request: SintRequest = {
    requestId: generateUUIDv7(),
    timestamp: new Date().toISOString(),
    agentId: agent.publicKey,
    tokenId: issued.value.tokenId,
    resource: "ros2:///cmd_vel",
    action: "publish",
    params,
    ...(physicalContext !== undefined && { physicalContext }),
  };
  return new PolicyGateway({ resolveToken: () => issued.value }).intercept(request);
}

describe("signed physical limits at the policy gateway", () => {
  it("denies reverse Twist motion exceeding the signed velocity limit", async () => {
    const decision = await decisionFor({ maxVelocityMps: 0.5 },
      { linear: { x: -0.6, y: 0, z: 0 } });
    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("CONSTRAINT_VIOLATION");
  });

  it("denies a malformed Twist component rather than coercing it", async () => {
    const decision = await decisionFor({ maxVelocityMps: 0.5 },
      { linear: { x: "fast", y: 0, z: 0 } });
    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("CONSTRAINT_VIOLATION");
  });

  it("denies torque and contact force above signed limits", async () => {
    const decision = await decisionFor({ maxTorqueNm: 5, contactForceThresholdN: 10 },
      { torque: -6 }, { currentContactForceNewtons: 11 });
    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("CONSTRAINT_VIOLATION");
  });
});
