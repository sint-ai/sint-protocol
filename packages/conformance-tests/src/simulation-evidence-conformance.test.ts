import { describe, expect, it } from "vitest";
import {
  ApprovalTier,
  type SimulationEvidenceReceipt,
  type SintCapabilityToken,
  type SintRequest,
} from "@pshkv/core";
import {
  generateKeypair,
  generateUUIDv7,
  issueCapabilityToken,
  sign,
} from "@pshkv/gate-capability-tokens";
import {
  DefaultSimulationEvidencePolicy,
  PolicyGateway,
  computeSimulationEffectPlanDigest,
  computeSimulationEvidenceSigningPayload,
  computeSimulationRequestDigest,
  computeSimulationTokenDigest,
} from "@pshkv/gate-policy-gateway";

const issuer = generateKeypair();
const agent = generateKeypair();
const simulator = generateKeypair();

function createFixture(escalateToT3 = false) {
  const now = Date.now();
  const issued = issueCapabilityToken({
    issuer: issuer.publicKey,
    subject: agent.publicKey,
    resource: "ros2:///cmd_vel",
    actions: ["publish"],
    constraints: { maxVelocityMps: 0.5 },
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    expiresAt: new Date(now + 60_000).toISOString(),
    revocable: false,
  }, issuer.privateKey);
  if (!issued.ok) throw new Error(issued.error);
  const token: SintCapabilityToken = issued.value;
  const request: SintRequest = {
    requestId: generateUUIDv7(),
    timestamp: new Date(now).toISOString(),
    agentId: agent.publicKey,
    tokenId: token.tokenId,
    resource: "ros2:///cmd_vel",
    action: "publish",
    params: { linear: { x: 0.2 }, angular: { z: 0 } },
    physicalContext: { currentVelocityMps: 0.2 },
  };
  const unsigned: SimulationEvidenceReceipt = {
    schemaVersion: "2.0.0",
    receiptId: generateUUIDv7(),
    evidenceGrade: "deterministic",
    requestDigest: computeSimulationRequestDigest(request),
    effectPlanDigest: computeSimulationEffectPlanDigest(request),
    tokenDigest: computeSimulationTokenDigest(token),
    resource: request.resource,
    action: request.action,
    worldSnapshot: {
      digest: "a".repeat(64),
      observedAt: new Date(now - 100).toISOString(),
      validUntil: new Date(now + 5_000).toISOString(),
      uncertainty: 0.01,
    },
    simulator: {
      backend: "gazebo-harmonic",
      version: "8.9.0",
      modelDigest: "b".repeat(64),
      imageDigest: "c".repeat(64),
    },
    scenarios: {
      scenarioSetDigest: "d".repeat(64),
      runCount: 64,
      coverage: 0.98,
    },
    result: {
      outcome: "pass",
      collisions: 0,
      safetyZoneViolations: 0,
      maxVelocityMps: 0.2,
    },
    generatedAt: new Date(now - 50).toISOString(),
    expiresAt: new Date(now + 5_000).toISOString(),
    nonce: "conformance-nonce-00000001",
    artifactDigest: "e".repeat(64),
    signerPublicKey: simulator.publicKey,
    signature: "0".repeat(128),
  };
  const receipt: SimulationEvidenceReceipt = {
    ...unsigned,
    signature: sign(simulator.privateKey, computeSimulationEvidenceSigningPayload(unsigned)),
  };
  const gateway = new PolicyGateway({
    resolveToken: () => token,
    simulationEvidencePolicy: new DefaultSimulationEvidencePolicy({
      trustedSignerKeys: [simulator.publicKey],
      tierRequirements: {
        [ApprovalTier.T2_ACT]: { minEvidenceGrade: "deterministic" },
        [ApprovalTier.T3_COMMIT]: {
          minEvidenceGrade: "physics",
          minApprovalQuorum: 2,
        },
      },
      now: () => now,
    }),
    ...(escalateToT3 && {
      csmlEscalation: {
        async evaluateAgent() {
          return {
            escalated: true,
            resultTier: ApprovalTier.T3_COMMIT,
            csmlScore: 0.95,
            reason: "conformance escalation",
          };
        },
      },
    }),
  });
  return { gateway, receipt, request };
}

describe("predictive simulation evidence conformance", () => {
  it("never treats a passing simulation as authorization for physical actuation", async () => {
    const { gateway, receipt, request } = createFixture();
    const decision = await gateway.intercept({
      ...request,
      executionContext: { simulationEvidence: receipt },
    });

    expect(decision.action, JSON.stringify(decision)).toBe("escalate");
    expect(decision.assignedTier).toBe("T2_act");
  });

  it("blocks forged evidence before normal tier evaluation", async () => {
    const { gateway, receipt, request } = createFixture();
    const decision = await gateway.intercept({
      ...request,
      executionContext: {
        simulationEvidence: { ...receipt, result: { ...receipt.result, collisions: 1 } },
      },
    });

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("SIMULATION_SIGNATURE_INVALID");
  });

  it("requires the higher evidence grade when runtime risk escalates T2 to T3", async () => {
    const { gateway, receipt, request } = createFixture(true);
    const decision = await gateway.intercept({
      ...request,
      executionContext: { simulationEvidence: receipt },
    });

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("SIMULATION_EVIDENCE_GRADE_INSUFFICIENT");
  });
});
