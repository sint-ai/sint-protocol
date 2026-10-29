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
  DeterministicEffectSimulator,
  FixedCaseBoundedMotionModel,
  InMemorySimulationArtifactStore,
  isValidBoundedMotionScenarioPolicy,
  sampleBoundedMotionPerturbations,
} from "../src/index.js";
import type { BoundedMotionScenarioPolicy, SeededBoundedMotionDistribution } from "../src/index.js";

function distribution(): SeededBoundedMotionDistribution {
  return {
    version: "1.0.0",
    seeds: [7, 11],
    bounds: {
      extraForceNewtons: { min: 0, max: 20 },
      extraVelocityMps: { min: 0, max: 0.2 },
      reducedClearanceMeters: { min: 0, max: 0.05 },
    },
  };
}

function policy(): BoundedMotionScenarioPolicy {
  return {
    version: "1.0.0",
    policyId: "seeded-motion-v1",
    cases: [{ id: "higher-force", extraForceNewtons: 5 }],
    distribution: distribution(),
  };
}

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

function preflight(): SimulationPreflight {
  return {
    kind: "simulation-preflight",
    authorizesExecution: false,
    assignedTier: ApprovalTier.T2_ACT,
    effectPlan: {
      requestDigest: "1".repeat(64),
      tokenDigest: "3".repeat(64),
      effectPlanDigest: hashSha256(canonicalJsonStringify({ resource, action, params: safeParams })),
      resource,
      action,
      params: safeParams,
    },
    requirement: { minEvidenceGrade: "deterministic" },
  };
}

describe("seeded bounded-motion perturbation policy", () => {
  it("rejects a duplicated seed", () => {
    const duplicated = policy();
    const approved = duplicated.distribution as unknown as { seeds: number[] };
    approved.seeds = [7, 7];
    expect(isValidBoundedMotionScenarioPolicy(duplicated)).toBe(false);
  });

  it("redraws the same in-bound perturbation for the same seed", () => {
    const approved = distribution();
    const first = sampleBoundedMotionPerturbations(approved);
    const second = sampleBoundedMotionPerturbations(approved);
    expect(second).toEqual(first);
    expect(first.map((sample) => sample.id)).toEqual(["seed:7", "seed:11"]);
    for (const sample of first) {
      expect(sample.extraForceNewtons).toBeGreaterThanOrEqual(0);
      expect(sample.extraForceNewtons).toBeLessThanOrEqual(20);
      expect(sample.extraVelocityMps).toBeGreaterThanOrEqual(0);
      expect(sample.extraVelocityMps).toBeLessThanOrEqual(0.2);
      expect(sample.reducedClearanceMeters).toBeGreaterThanOrEqual(0);
      expect(sample.reducedClearanceMeters).toBeLessThanOrEqual(0.05);
    }
  });

  it("stores the approved seeds on the signed receipt", async () => {
    const approved = policy();
    const simulator = new DeterministicEffectSimulator({
      signerPublicKey: signer.publicKey,
      signerPrivateKey: signer.privateKey,
      version: "0.1.0",
      modelDigest: "b".repeat(64),
      now: () => now,
      artifactStore: new InMemorySimulationArtifactStore(),
      receiptRecorder: { recordIssued: async () => ok(undefined) },
      models: [new FixedCaseBoundedMotionModel({
        resources: [resource],
        actions: [action],
        envelope: {
          maxVelocityMps: 0.5,
          maxForceNewtons: 80,
          minClearanceMeters: 0.2,
        },
      }, approved)],
    });
    const simulated = await simulator.simulate(preflight(), world());
    expect(simulated.ok).toBe(true);
    if (!simulated.ok) return;
    expect(simulated.value.scenarios).toMatchObject({
      runCount: 4,
      seeds: [7, 11],
    });
  });
});
