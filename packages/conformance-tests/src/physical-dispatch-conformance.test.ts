import { describe, expect, it } from "vitest";
import {
  ApprovalTier,
  RiskTier,
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
  assignTier,
  computeSimulationEffectPlanDigest,
  computeSimulationEvidenceSigningPayload,
  computeSimulationRequestDigest,
  computeSimulationTokenDigest,
} from "@pshkv/gate-policy-gateway";

const issuer = generateKeypair();
const agent = generateKeypair();
const simulator = generateKeypair();

const actuatingCases = [
  {
    name: "home assistant lock",
    resource: "ha://home/lock.front_door",
    action: "call",
    params: { state: "locked" },
  },
  {
    name: "direct http actuator",
    resource: "https://cell.local/cmd/valve",
    action: "call",
    params: { open: true },
  },
  {
    name: "named mcp robot tool",
    resource: "mcp://arm/close_gripper",
    action: "call",
    params: { widthM: 0.02 },
  },
] as const;

function gatewayFor(resource: string, action: string, params: Record<string, unknown>) {
  const now = Date.now();
  const issued = issueCapabilityToken({
    issuer: issuer.publicKey,
    subject: agent.publicKey,
    resource,
    actions: [action],
    constraints: {},
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
    resource,
    action,
    params,
  };
  const unsigned: SimulationEvidenceReceipt = {
    schemaVersion: "2.0.0",
    receiptId: generateUUIDv7(),
    evidenceGrade: "deterministic",
    requestDigest: computeSimulationRequestDigest(request),
    effectPlanDigest: computeSimulationEffectPlanDigest(request),
    tokenDigest: computeSimulationTokenDigest(token),
    resource,
    action,
    worldSnapshot: {
      digest: "a".repeat(64),
      observedAt: new Date(now - 100).toISOString(),
      validUntil: new Date(now + 5_000).toISOString(),
      uncertainty: 0.01,
    },
    simulator: {
      backend: "deterministic-envelope",
      version: "1.0.0",
      modelDigest: "b".repeat(64),
    },
    scenarios: {
      scenarioSetDigest: "d".repeat(64),
      runCount: 1,
    },
    result: {
      outcome: "pass",
      collisions: 0,
      safetyZoneViolations: 0,
    },
    generatedAt: new Date(now - 50).toISOString(),
    expiresAt: new Date(now + 5_000).toISOString(),
    nonce: `dispatch-${generateUUIDv7()}`,
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
    tierRules: [{
      resourcePattern: resource,
      actions: [action],
      baseTier: ApprovalTier.T0_OBSERVE,
      baseRisk: RiskTier.T0_READ,
    }],
    simulationEvidencePolicy: new DefaultSimulationEvidencePolicy({
      trustedSignerKeys: [simulator.publicKey],
      tierRequirements: {
        [ApprovalTier.T2_ACT]: { minEvidenceGrade: "deterministic" },
        [ApprovalTier.T3_COMMIT]: { minEvidenceGrade: "physics", minApprovalQuorum: 2 },
      },
      now: () => now,
    }),
  });
  return { gateway, receipt, request };
}

describe("inventoried physical dispatch conformance", () => {
  it.each(actuatingCases)(
    "keeps a $name command at ACT when a site rule labels it observe",
    (entry) => {
      const assignment = assignTier({
        requestId: generateUUIDv7(),
        timestamp: new Date().toISOString(),
        agentId: agent.publicKey,
        tokenId: generateUUIDv7(),
        resource: entry.resource,
        action: entry.action,
        params: entry.params,
      }, {
        rules: [{
          resourcePattern: entry.resource,
          actions: [entry.action],
          baseTier: ApprovalTier.T0_OBSERVE,
          baseRisk: RiskTier.T0_READ,
        }],
      });
      expect(assignment.approvalTier).toBe(ApprovalTier.T2_ACT);
    },
  );

  it.each(actuatingCases)(
    "denies a $name command with no signed receipt despite a T0 site rule",
    async (entry) => {
      const { gateway, request } = gatewayFor(entry.resource, entry.action, entry.params);
      const decision = await gateway.intercept(request);
      expect(decision.action).toBe("deny");
      expect(decision.denial?.policyViolated).toBe("SIMULATION_EVIDENCE_MISSING");
    },
  );

  it.each(actuatingCases)(
    "rejects a changed $name effect even when the old receipt is signed",
    async (entry) => {
      const { gateway, receipt, request } = gatewayFor(entry.resource, entry.action, entry.params);
      const decision = await gateway.intercept({
        ...request,
        params: { ...entry.params, substituted: true },
        executionContext: { simulationEvidence: receipt },
      });
      expect(decision.action).toBe("deny");
      expect(decision.denial?.policyViolated).toBe("SIMULATION_CONTEXT_MISMATCH");
    },
  );
});
