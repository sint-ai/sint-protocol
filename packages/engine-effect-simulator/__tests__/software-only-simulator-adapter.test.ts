import { describe, expect, it } from "vitest";
import {
  ApprovalTier,
  canonicalJsonStringify,
  ok,
  type SimulationPreflight,
  type SimulationWorldSnapshot,
} from "@pshkv/core";
import { generateKeypair, hashSha256 } from "@pshkv/gate-capability-tokens";
import {
  BoundedMotionEffectModel,
  DeterministicEffectSimulator,
  InMemorySimulationArtifactStore,
  SoftwareOnlySimulatorAdapter,
} from "../src/index.js";

const signer = generateKeypair();
const now = Date.now();
const resource = "ros2:///arm/command";
const action = "publish";
const safeParams = {
  jointPositions: { shoulder: 0.25 },
  target: { x: 1, y: 0.2, z: 1.4 },
  velocityMps: 0.3,
  forceNewtons: 45,
  clearanceMeters: 0.4,
  collisions: 0,
  safetyZoneViolations: 0,
};

function world(): SimulationWorldSnapshot {
  return {
    digest: "a".repeat(64),
    observedAt: new Date(now - 100).toISOString(),
    validUntil: new Date(now + 10_000).toISOString(),
    stateEpoch: "cell-7:42",
    uncertainty: 0.01,
  };
}

function preflight(params: Record<string, unknown>): SimulationPreflight {
  return {
    kind: "simulation-preflight",
    authorizesExecution: false,
    assignedTier: ApprovalTier.T2_ACT,
    effectPlan: {
      requestDigest: "1".repeat(64),
      tokenDigest: "3".repeat(64),
      effectPlanDigest: hashSha256(canonicalJsonStringify({ resource, action, params })),
      resource,
      action,
      params,
    },
    requirement: { minEvidenceGrade: "deterministic" },
  };
}

function adapter() {
  const inner = new DeterministicEffectSimulator({
    signerPublicKey: signer.publicKey,
    signerPrivateKey: signer.privateKey,
    version: "0.1.0",
    modelDigest: "b".repeat(64),
    now: () => now,
    artifactStore: new InMemorySimulationArtifactStore(),
    receiptRecorder: { recordIssued: async () => ok(undefined) },
    models: [new BoundedMotionEffectModel({
      resources: [resource],
      actions: [action],
      envelope: {
        maxVelocityMps: 0.5,
        maxForceNewtons: 80,
        minClearanceMeters: 0.2,
      },
    })],
  });
  return new SoftwareOnlySimulatorAdapter(inner);
}

describe("software-only simulator adapter", () => {
  it("records a safe bounded motion as a software-only pass", async () => {
    const worker = adapter();
    const simulated = await worker.simulate(preflight(safeParams), world());

    expect(simulated.ok).toBe(true);
    if (!simulated.ok) return;
    expect(simulated.value.result.outcome).toBe("pass");
    expect(simulated.value.evidenceGrade).toBe("deterministic");
    expect(simulated.value.simulator.backend).toBe("sint-deterministic");
    expect(worker.records).toEqual([
      {
        outcome: "pass",
        backend: "sint-deterministic",
        evidenceGrade: "deterministic",
      },
    ]);
  });

  it("records an exceeded bound as a software-only fail", async () => {
    const worker = adapter();
    const simulated = await worker.simulate(preflight({
      ...safeParams,
      velocityMps: 0.8,
    }), world());

    expect(simulated.ok).toBe(true);
    if (!simulated.ok) return;
    expect(simulated.value.result.outcome).toBe("fail");
    expect(simulated.value.simulator.backend).toBe("sint-deterministic");
    expect(worker.records).toEqual([
      {
        outcome: "fail",
        backend: "sint-deterministic",
        evidenceGrade: "deterministic",
      },
    ]);
  });

  it("records a missing clearance observation as software-only indeterminate", async () => {
    const { clearanceMeters: _clearanceMeters, ...missingClearance } = safeParams;
    const worker = adapter();
    const simulated = await worker.simulate(preflight(missingClearance), world());

    expect(simulated.ok).toBe(true);
    if (!simulated.ok) return;
    expect(simulated.value.result.outcome).toBe("indeterminate");
    expect(simulated.value.evidenceGrade).toBe("deterministic");
    expect(simulated.value.simulator.backend).toBe("sint-deterministic");
    expect(worker.records).toEqual([
      {
        outcome: "indeterminate",
        backend: "sint-deterministic",
        evidenceGrade: "deterministic",
      },
    ]);
  });
});
