import { describe, expect, it } from "vitest";
import {
  ApprovalTier,
  type SimulationEvidenceRequirement,
  type SimulationEvidenceReceipt,
  type SintCapabilityToken,
  type SintPhysicalConstraints,
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
  InMemorySimulationReceiptReplayStore,
  computeSimulationEffectPlanDigest,
  computeSimulationEvidenceSigningPayload,
  computeSimulationRequestDigest,
  computeSimulationTokenDigest,
} from "../src/simulation-evidence-policy.js";
import { PolicyGateway } from "../src/gateway.js";

const issuer = generateKeypair();
const agent = generateKeypair();
const simulator = generateKeypair();
const now = Date.now();

function iso(time: number): string {
  return new Date(time).toISOString();
}

function makeToken(constraints: SintPhysicalConstraints = {}): SintCapabilityToken {
  const issued = issueCapabilityToken({
    issuer: issuer.publicKey,
    subject: agent.publicKey,
    resource: "mcp://digital-twin/status",
    actions: ["read"],
    constraints,
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    expiresAt: iso(now + 3_600_000),
    revocable: false,
  }, issuer.privateKey);
  if (!issued.ok) throw new Error(issued.error);
  return issued.value;
}

function makeActionToken(
  resource: string,
  action: string,
  constraints: SintPhysicalConstraints = {},
): SintCapabilityToken {
  const issued = issueCapabilityToken({
    issuer: issuer.publicKey,
    subject: agent.publicKey,
    resource,
    actions: [action],
    constraints,
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    expiresAt: iso(now + 3_600_000),
    revocable: false,
  }, issuer.privateKey);
  if (!issued.ok) throw new Error(issued.error);
  return issued.value;
}

function makeRequest(token: SintCapabilityToken): SintRequest {
  return {
    requestId: generateUUIDv7(),
    timestamp: iso(now),
    agentId: agent.publicKey,
    tokenId: token.tokenId,
    resource: "mcp://digital-twin/status",
    action: "read",
    params: { zone: "cell-7" },
    executionContext: {
      deploymentProfile: "industrial-cell",
      siteId: "factory-1",
    },
  };
}

function makeActionRequest(
  token: SintCapabilityToken,
  resource: string,
  action: string,
): SintRequest {
  return {
    requestId: generateUUIDv7(),
    timestamp: iso(now),
    agentId: agent.publicKey,
    tokenId: token.tokenId,
    resource,
    action,
    params: { command: "bounded-effect" },
  };
}

function signedReceipt(
  request: SintRequest,
  token: SintCapabilityToken,
  mutate?: (receipt: SimulationEvidenceReceipt) => SimulationEvidenceReceipt,
): SimulationEvidenceReceipt {
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
      digest: "1".repeat(64),
      observedAt: iso(now - 100),
      validUntil: iso(now + 10_000),
      stateEpoch: "world-42",
      uncertainty: 0.02,
    },
    simulator: {
      backend: "gazebo-harmonic",
      version: "8.9.0",
      modelDigest: "2".repeat(64),
      imageDigest: "3".repeat(64),
    },
    scenarios: {
      scenarioSetDigest: "4".repeat(64),
      runCount: 128,
      coverage: 0.99,
      seeds: [11, 29, 47],
    },
    result: {
      outcome: "pass",
      collisions: 0,
      safetyZoneViolations: 0,
      minClearanceMeters: 0.35,
    },
    generatedAt: iso(now - 50),
    expiresAt: iso(now + 10_000),
    nonce: "nonce-00000000000000000001",
    artifactDigest: "5".repeat(64),
    signerPublicKey: simulator.publicKey,
    signature: "0".repeat(128),
  };
  const prepared = mutate?.(unsigned) ?? unsigned;
  return {
    ...prepared,
    signature: sign(simulator.privateKey, computeSimulationEvidenceSigningPayload(prepared)),
  };
}

function gateway(token: SintCapabilityToken, replayStore = new InMemorySimulationReceiptReplayStore()) {
  return {
    replayStore,
    value: new PolicyGateway({
      resolveToken: () => token,
      simulationEvidencePolicy: new DefaultSimulationEvidencePolicy({
        trustedSignerKeys: [simulator.publicKey],
        allowedBackends: ["gazebo-harmonic"],
        minScenarioRuns: 100,
        minScenarioCoverage: 0.95,
        maxWorldUncertainty: 0.05,
        replayStore,
        now: () => now,
      }),
    }),
  };
}

const tierRequirements: Partial<Record<ApprovalTier, SimulationEvidenceRequirement>> = {
  [ApprovalTier.T2_ACT]: { minEvidenceGrade: "deterministic" },
  [ApprovalTier.T3_COMMIT]: {
    minEvidenceGrade: "physics",
    minScenarioRuns: 100,
    requiredBindings: ["robotId", "controllerId"],
    expectedBindings: { robotId: "robot-7", controllerId: "plc-4" },
    minApprovalQuorum: 2,
  },
};

function tieredGateway(token: SintCapabilityToken): PolicyGateway {
  return new PolicyGateway({
    resolveToken: () => token,
    simulationEvidencePolicy: new DefaultSimulationEvidencePolicy({
      trustedSignerKeys: [simulator.publicKey],
      maxEvidenceGradeBySigner: { [simulator.publicKey]: "digital-twin" },
      tierRequirements,
      now: () => now,
    }),
  });
}

describe("predictive simulation evidence policy", () => {
  it("allows the normal gateway pipeline to continue for a valid bound receipt", async () => {
    const token = makeToken();
    const request = makeRequest(token);
    const receipt = signedReceipt(request, token);
    const decision = await gateway(token).value.intercept({
      ...request,
      executionContext: { ...request.executionContext, simulationEvidence: receipt },
    });

    expect(decision.action).toBe("allow");
  });

  it("fails closed when required simulation evidence is missing", async () => {
    const token = makeToken();
    const decision = await gateway(token).value.intercept(makeRequest(token));

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("SIMULATION_EVIDENCE_MISSING");
  });

  it("rejects a receipt modified after signing", async () => {
    const token = makeToken();
    const request = makeRequest(token);
    const receipt = signedReceipt(request, token);
    const forged = { ...receipt, artifactDigest: "9".repeat(64) };
    const decision = await gateway(token).value.intercept({
      ...request,
      executionContext: { ...request.executionContext, simulationEvidence: forged },
    });

    expect(decision.denial?.policyViolated).toBe("SIMULATION_SIGNATURE_INVALID");
  });

  it("rejects stale world and receipt evidence", async () => {
    const token = makeToken();
    const request = makeRequest(token);
    const receipt = signedReceipt(request, token, (draft) => ({
      ...draft,
      generatedAt: iso(now - 60_000),
      expiresAt: iso(now + 1_000),
    }));
    const decision = await gateway(token).value.intercept({
      ...request,
      executionContext: { ...request.executionContext, simulationEvidence: receipt },
    });

    expect(decision.denial?.policyViolated).toBe("SIMULATION_EVIDENCE_STALE");
  });

  it("rejects evidence when the requested effect changes after simulation", async () => {
    const token = makeToken();
    const request = makeRequest(token);
    const receipt = signedReceipt(request, token);
    const decision = await gateway(token).value.intercept({
      ...request,
      params: { zone: "cell-8" },
      executionContext: { ...request.executionContext, simulationEvidence: receipt },
    });

    expect(decision.denial?.policyViolated).toBe("SIMULATION_CONTEXT_MISMATCH");
  });

  it("rejects a receipt whose nonce was consumed by the execution broker", async () => {
    const token = makeToken();
    const request = makeRequest(token);
    const receipt = signedReceipt(request, token);
    const configured = gateway(token);
    configured.replayStore.consume(receipt.receiptId, receipt.nonce);
    const decision = await configured.value.intercept({
      ...request,
      executionContext: { ...request.executionContext, simulationEvidence: receipt },
    });

    expect(decision.denial?.policyViolated).toBe("SIMULATION_EVIDENCE_REPLAYED");
  });

  it("rejects unsafe and indeterminate simulation outcomes", async () => {
    const token = makeToken();
    const request = makeRequest(token);
    const receipt = signedReceipt(request, token, (draft) => ({
      ...draft,
      result: { ...draft.result, outcome: "indeterminate" },
    }));
    const decision = await gateway(token).value.intercept({
      ...request,
      executionContext: { ...request.executionContext, simulationEvidence: receipt },
    });

    expect(decision.denial?.policyViolated).toBe("SIMULATION_UNSAFE");
  });

  it("rejects predicted physical values that exceed capability-token constraints", async () => {
    const token = makeToken({ maxForceNewtons: 10 });
    const request = makeRequest(token);
    const receipt = signedReceipt(request, token, (draft) => ({
      ...draft,
      result: { ...draft.result, maxForceNewtons: 12 },
    }));
    const decision = await gateway(token).value.intercept({
      ...request,
      executionContext: { ...request.executionContext, simulationEvidence: receipt },
    });

    expect(decision.denial?.policyViolated).toBe("SIMULATION_CONSTRAINT_VIOLATION");
  });

  it("returns an advisory T2 preflight with the exact effect plan and required grade", async () => {
    const token = makeActionToken("ros2:///cmd_vel", "publish");
    const request = makeActionRequest(token, "ros2:///cmd_vel", "publish");
    const preflight = await tieredGateway(token).preflightSimulation(request);

    expect(preflight.ok).toBe(true);
    if (!preflight.ok) return;
    expect(preflight.value.authorizesExecution).toBe(false);
    expect(preflight.value.assignedTier).toBe(ApprovalTier.T2_ACT);
    expect(preflight.value.requirement?.minEvidenceGrade).toBe("deterministic");
    expect(preflight.value.effectPlan.requestDigest).toBe(computeSimulationRequestDigest(request));
    expect(preflight.value.effectPlan.params).toEqual(request.params);
  });

  it("does not require simulation for tiers omitted from the configured matrix", async () => {
    const token = makeToken();
    const decision = await tieredGateway(token).intercept(makeRequest(token));

    expect(decision.action).toBe("allow");
  });

  it("audits missing T1 evidence in shadow mode without blocking the request", async () => {
    const token = makeActionToken("mcp://server/tool", "call");
    const request = makeActionRequest(token, "mcp://server/tool", "call");
    const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
    const configured = new PolicyGateway({
      resolveToken: () => token,
      emitLedgerEvent: (event) => events.push(event),
      simulationEvidencePolicy: new DefaultSimulationEvidencePolicy({
        trustedSignerKeys: [simulator.publicKey],
        tierRequirements: {
          [ApprovalTier.T1_PREPARE]: { minEvidenceGrade: "deterministic" },
          [ApprovalTier.T2_ACT]: { minEvidenceGrade: "deterministic" },
        },
        shadowTiers: [ApprovalTier.T1_PREPARE],
        now: () => now,
      }),
    });

    const preflight = await configured.preflightSimulation(request);
    const decision = await configured.intercept(request);

    expect(preflight.ok && preflight.value.requirement?.minEvidenceGrade).toBe("deterministic");
    expect(decision.action).toBe("allow");
    expect(decision.assignedTier).toBe(ApprovalTier.T1_PREPARE);
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "simulation.receipt.rejected",
      payload: expect.objectContaining({
        assignedTier: ApprovalTier.T1_PREPARE,
        policyViolated: "SIMULATION_EVIDENCE_MISSING",
        enforcementMode: "shadow",
      }),
    }));
  });

  it("keeps T2 evidence fail-closed when T1 is configured for shadow mode", async () => {
    const token = makeActionToken("ros2:///cmd_vel", "publish");
    const request = makeActionRequest(token, "ros2:///cmd_vel", "publish");
    const configured = new PolicyGateway({
      resolveToken: () => token,
      simulationEvidencePolicy: new DefaultSimulationEvidencePolicy({
        trustedSignerKeys: [simulator.publicKey],
        tierRequirements: {
          [ApprovalTier.T1_PREPARE]: { minEvidenceGrade: "deterministic" },
          [ApprovalTier.T2_ACT]: { minEvidenceGrade: "deterministic" },
        },
        shadowTiers: [ApprovalTier.T1_PREPARE],
        now: () => now,
      }),
    });

    const decision = await configured.intercept(request);

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("SIMULATION_EVIDENCE_MISSING");
  });

  it("clamps a misconfigured custom T2 shadow policy back to enforcement", async () => {
    const token = makeActionToken("ros2:///cmd_vel", "publish");
    const request = makeActionRequest(token, "ros2:///cmd_vel", "publish");
    const basePolicy = new DefaultSimulationEvidencePolicy({
      trustedSignerKeys: [simulator.publicKey],
      tierRequirements: {
        [ApprovalTier.T2_ACT]: { minEvidenceGrade: "deterministic" },
      },
      now: () => now,
    });
    const configured = new PolicyGateway({
      resolveToken: () => token,
      simulationEvidencePolicy: {
        getRequirement: (...args) => basePolicy.getRequirement(...args),
        getEnforcementMode: () => "shadow",
        evaluate: (...args) => basePolicy.evaluate(...args),
      },
    });

    const decision = await configured.intercept(request);

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("SIMULATION_EVIDENCE_MISSING");
  });

  it("accepts deterministic evidence for T2 but still requires human review", async () => {
    const token = makeActionToken("ros2:///cmd_vel", "publish");
    const request = makeActionRequest(token, "ros2:///cmd_vel", "publish");
    const receipt = signedReceipt(request, token);
    const decision = await tieredGateway(token).intercept({
      ...request,
      executionContext: { simulationEvidence: receipt },
    });

    expect(decision.action).toBe("escalate");
    expect(decision.assignedTier).toBe(ApprovalTier.T2_ACT);
  });

  it("rejects deterministic evidence when final tier requires physics evidence", async () => {
    const token = makeActionToken("ros2:///mode_change", "publish", {
      quorum: { required: 2, authorized: ["operator-a", "operator-b"] },
    });
    const request = makeActionRequest(token, "ros2:///mode_change", "publish");
    const receipt = signedReceipt(request, token);
    const decision = await tieredGateway(token).intercept({
      ...request,
      executionContext: { simulationEvidence: receipt },
    });

    expect(decision.denial?.policyViolated).toBe("SIMULATION_EVIDENCE_GRADE_INSUFFICIENT");
  });

  it("selects evidence depth after CSML raises the final tier", async () => {
    const token = makeActionToken("ros2:///cmd_vel", "publish", {
      quorum: { required: 2, authorized: ["operator-a", "operator-b"] },
    });
    const request = makeActionRequest(token, "ros2:///cmd_vel", "publish");
    const receipt = signedReceipt(request, token);
    const policy = new DefaultSimulationEvidencePolicy({
      trustedSignerKeys: [simulator.publicKey],
      maxEvidenceGradeBySigner: { [simulator.publicKey]: "digital-twin" },
      tierRequirements,
      now: () => now,
    });
    const configured = new PolicyGateway({
      resolveToken: () => token,
      simulationEvidencePolicy: policy,
      csmlEscalation: {
        async evaluateAgent() {
          return {
            escalated: true,
            resultTier: ApprovalTier.T3_COMMIT,
            csmlScore: 0.9,
            reason: "risk escalation",
          };
        },
      },
    });
    const decision = await configured.intercept({
      ...request,
      executionContext: { simulationEvidence: receipt },
    });

    expect(decision.denial?.policyViolated).toBe("SIMULATION_EVIDENCE_GRADE_INSUFFICIENT");
  });

  it("accepts bound physics evidence for T3 but never turns it into authorization", async () => {
    const token = makeActionToken("ros2:///mode_change", "publish", {
      quorum: { required: 2, authorized: ["operator-a", "operator-b"] },
    });
    const request = makeActionRequest(token, "ros2:///mode_change", "publish");
    const receipt = signedReceipt(request, token, (draft) => ({
      ...draft,
      evidenceGrade: "physics",
      bindings: { robotId: "robot-7", controllerId: "plc-4" },
    }));
    const decision = await tieredGateway(token).intercept({
      ...request,
      executionContext: { simulationEvidence: receipt },
    });

    expect(decision.action).toBe("escalate");
    expect(decision.assignedTier).toBe(ApprovalTier.T3_COMMIT);
    expect(decision.escalation?.approvalQuorum?.required).toBe(2);
  });

  it("rejects T3 evidence when the token lacks the required human quorum", async () => {
    const token = makeActionToken("ros2:///mode_change", "publish");
    const request = makeActionRequest(token, "ros2:///mode_change", "publish");
    const receipt = signedReceipt(request, token, (draft) => ({
      ...draft,
      evidenceGrade: "physics",
      bindings: { robotId: "robot-7", controllerId: "plc-4" },
    }));
    const decision = await tieredGateway(token).intercept({
      ...request,
      executionContext: { simulationEvidence: receipt },
    });

    expect(decision.denial?.policyViolated).toBe("SIMULATION_APPROVAL_QUORUM_INSUFFICIENT");
  });

  it("rejects a receipt grade above the signer's accredited evidence grade", async () => {
    const token = makeActionToken("ros2:///mode_change", "publish", {
      quorum: { required: 2, authorized: ["operator-a", "operator-b"] },
    });
    const request = makeActionRequest(token, "ros2:///mode_change", "publish");
    const receipt = signedReceipt(request, token, (draft) => ({
      ...draft,
      evidenceGrade: "physics",
      bindings: { robotId: "robot-7", controllerId: "plc-4" },
    }));
    const policy = new DefaultSimulationEvidencePolicy({
      trustedSignerKeys: [simulator.publicKey],
      maxEvidenceGradeBySigner: { [simulator.publicKey]: "deterministic" },
      tierRequirements,
      now: () => now,
    });
    const decision = await new PolicyGateway({
      resolveToken: () => token,
      simulationEvidencePolicy: policy,
    }).intercept({
      ...request,
      executionContext: { simulationEvidence: receipt },
    });

    expect(decision.denial?.policyViolated).toBe("SIMULATION_SIGNER_GRADE_UNTRUSTED");
  });

  it("rejects signed evidence bound to the wrong physical controller", async () => {
    const token = makeActionToken("ros2:///mode_change", "publish", {
      quorum: { required: 2, authorized: ["operator-a", "operator-b"] },
    });
    const request = makeActionRequest(token, "ros2:///mode_change", "publish");
    const receipt = signedReceipt(request, token, (draft) => ({
      ...draft,
      evidenceGrade: "physics",
      bindings: { robotId: "robot-7", controllerId: "plc-other" },
    }));
    const decision = await tieredGateway(token).intercept({
      ...request,
      executionContext: { simulationEvidence: receipt },
    });

    expect(decision.denial?.policyViolated).toBe("SIMULATION_BINDING_MISMATCH");
  });
});
