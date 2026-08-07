import { describe, expect, it, vi } from "vitest";
import {
  ApprovalTier,
  type SintRequest,
  type SimulationWorldSnapshot,
} from "@pshkv/core";
import {
  generateKeypair,
  generateUUIDv7,
  issueCapabilityToken,
} from "@pshkv/gate-capability-tokens";
import {
  DefaultSimulationEvidencePolicy,
  PolicyGateway,
} from "@pshkv/gate-policy-gateway";
import {
  BoundedMotionEffectModel,
  DeterministicEffectSimulator,
  InMemorySimulationArtifactStore,
} from "@pshkv/engine-effect-simulator";
import { createROS2WorldSnapshot } from "@pshkv/bridge-ros2";
import { EvidenceLedgerSimulationReceiptRecorder, LedgerWriter } from "@pshkv/gate-evidence-ledger";

const root = generateKeypair();
const agent = generateKeypair();
const simulatorSigner = generateKeypair();
const now = Date.now();
const digest = (character: string): string => character.repeat(64);

const tokenResult = issueCapabilityToken({
  issuer: root.publicKey,
  subject: agent.publicKey,
  resource: "ros2:///cmd_vel",
  actions: ["publish"],
  constraints: { maxVelocityMps: 0.5, maxForceNewtons: 50 },
  delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
  expiresAt: new Date(now + 60_000).toISOString(),
  revocable: false,
}, root.privateKey);
if (!tokenResult.ok) throw new Error(tokenResult.error);
const token = tokenResult.value;

const worldCapture = createROS2WorldSnapshot({
  robotId: "mobile-base-1",
  frameId: "map",
  stateEpoch: "mobile-base-1:100",
  capturedAt: new Date(now).toISOString(),
  odometry: {
    observedAt: new Date(now - 10).toISOString(),
    value: {
      pose: {
        position: { x: 0, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
      twist: {
        linear: { x: 0, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 0 },
      },
    },
  },
  safetyController: {
    controllerId: "nav-controller-1",
    observedAt: new Date(now - 10).toISOString(),
    permitState: "granted",
    estopEngaged: false,
    protectiveStopEngaged: false,
    safetyZoneClear: true,
    uncertainty: 0.01,
  },
}, { now: () => now, validityMs: 5_000, requiredSources: ["odometry", "safetyController"] });
if (!worldCapture.ok) throw new Error(worldCapture.error.message);
const worldSnapshot: SimulationWorldSnapshot = worldCapture.value.snapshot;

function request(velocityMps: number): SintRequest {
  return {
    requestId: generateUUIDv7(),
    timestamp: new Date(now).toISOString(),
    agentId: agent.publicKey,
    tokenId: token.tokenId,
    resource: "ros2:///cmd_vel",
    action: "publish",
    params: {
      velocityMps,
      forceNewtons: 10,
      collisions: 0,
      safetyZoneViolations: 0,
    },
  };
}

function setup() {
  const events = vi.fn();
  const simulationLedger = new LedgerWriter();
  const policy = new DefaultSimulationEvidencePolicy({
    trustedSignerKeys: [simulatorSigner.publicKey],
    allowedBackends: ["sint-deterministic"],
    tierRequirements: {
      [ApprovalTier.T2_ACT]: {
        minEvidenceGrade: "deterministic",
        minScenarioRuns: 1,
        minScenarioCoverage: 1,
        requiredBindings: ["robotId", "controllerId"],
        expectedBindings: { robotId: "mobile-base-1", controllerId: "nav-controller-1" },
      },
    },
    // Deterministic evidence is deliberately scoped to static checks; the
    // declared dynamic-physics limitations remain visible for human review.
    denyUnsupportedPhenomena: false,
    now: () => now,
  });
  const gateway = new PolicyGateway({
    resolveToken: () => token,
    simulationEvidencePolicy: policy,
    emitLedgerEvent: events,
  });
  const simulator = new DeterministicEffectSimulator({
    signerPublicKey: simulatorSigner.publicKey,
    signerPrivateKey: simulatorSigner.privateKey,
    version: "0.1.0",
    modelDigest: digest("b"),
    artifactStore: new InMemorySimulationArtifactStore(),
    receiptRecorder: new EvidenceLedgerSimulationReceiptRecorder(simulationLedger),
    bindings: { robotId: "mobile-base-1", controllerId: "nav-controller-1" },
    now: () => now,
    models: [new BoundedMotionEffectModel({
      resources: ["ros2:///cmd_vel"],
      actions: ["publish"],
      envelope: { maxVelocityMps: 0.5, maxForceNewtons: 50 },
    })],
  });
  return { events, gateway, simulator, simulationLedger };
}

describe("deterministic EffectSimulator conformance", () => {
  it("turns a gateway preflight into verified evidence without authorizing T2", async () => {
    const { events, gateway, simulator, simulationLedger } = setup();
    const original = request(0.3);
    const preflight = await gateway.preflightSimulation(original);
    expect(preflight.ok).toBe(true);
    if (!preflight.ok) return;
    expect(preflight.value.authorizesExecution).toBe(false);

    const simulated = await simulator.simulate(preflight.value, worldSnapshot);
    expect(simulated.ok).toBe(true);
    if (!simulated.ok) return;

    const decision = await gateway.intercept({
      ...original,
      executionContext: { simulationEvidence: simulated.value },
    });
    expect(decision.action).toBe("escalate");
    expect(decision.assignedTier).toBe(ApprovalTier.T2_ACT);
    expect(events).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "simulation.receipt.verified",
    }));
    expect(simulationLedger.getAll()).toEqual([
      expect.objectContaining({
        eventType: "simulation.receipt.issued",
        payload: expect.objectContaining({
          receiptId: simulated.value.receiptId,
          authorizesExecution: false,
        }),
      }),
    ]);
    expect(simulationLedger.verifyChain()).toEqual({ ok: true, value: true });
  });

  it("blocks an action when deterministic checks produce a signed fail result", async () => {
    const { gateway, simulator } = setup();
    const original = request(0.8);
    const preflight = await gateway.preflightSimulation(original);
    if (!preflight.ok) throw new Error(preflight.error.reason);
    const simulated = await simulator.simulate(preflight.value, worldSnapshot);
    if (!simulated.ok) throw new Error(simulated.error.message);
    expect(simulated.value.result.outcome).toBe("fail");

    const decision = await gateway.intercept({
      ...original,
      executionContext: { simulationEvidence: simulated.value },
    });
    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("SIMULATION_UNSAFE");
  });
});
