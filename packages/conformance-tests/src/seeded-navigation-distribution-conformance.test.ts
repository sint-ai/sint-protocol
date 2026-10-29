import { describe, expect, it } from "vitest";
import { ApprovalTier, canonicalJsonStringify, ok, type SimulationPreflight } from "@pshkv/core";
import { generateKeypair, hashSha256 } from "@pshkv/gate-capability-tokens";
import { createROS2WorldSnapshot, persistROS2WorldSnapshot, type ROS2WorldStateInput } from "@pshkv/bridge-ros2";
import {
  DeterministicEffectSimulator,
  FixedCaseNavigationModel,
  InMemorySimulationArtifactStore,
  navigationScenarioPolicyDigest,
  type NavigationScenarioPolicy,
} from "@pshkv/engine-effect-simulator";

const now = Date.now();
const observedAt = new Date(now - 20).toISOString();
const capturedAt = new Date(now).toISOString();
const signer = generateKeypair();
const resource = "ros2:///nav/segment";
const action = "publish";

function scene(overrides: Partial<ROS2WorldStateInput> = {}): ROS2WorldStateInput {
  return {
    robotId: "mobile-1",
    frameId: "map",
    stateEpoch: "mobile-1:42",
    capturedAt,
    robotPositionUncertaintyMeters: 0.02,
    odometry: {
      observedAt,
      frameId: "map",
      value: {
        pose: { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
        twist: { linear: { x: 0, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } },
      },
    },
    map: { digest: "a".repeat(64), frameId: "map", observedAt },
    obstacleScanObservedAt: observedAt,
    obstacles: [{
      id: "shelf",
      frameId: "map",
      kind: "static",
      position: { x: 0.5, y: 2, z: 0 },
      radiusMeters: 0.2,
      positionUncertaintyMeters: 0.05,
      observedAt,
    }],
    safetyController: {
      controllerId: "plc-1",
      observedAt,
      permitState: "granted",
      estopEngaged: false,
      protectiveStopEngaged: false,
      safetyZoneClear: true,
    },
    ...overrides,
  };
}

function preflight(params: Record<string, unknown> = {
  robotId: "mobile-1",
  frameId: "map",
  target: { x: 1, y: 0, z: 0 },
  velocityMps: 0.5,
}): SimulationPreflight {
  return {
    kind: "simulation-preflight",
    authorizesExecution: false,
    assignedTier: ApprovalTier.T2_ACT,
    effectPlan: {
      requestDigest: "1".repeat(64),
      tokenDigest: "2".repeat(64),
      effectPlanDigest: hashSha256(canonicalJsonStringify({ resource, action, params })),
      resource,
      action,
      params,
    },
    requirement: { minEvidenceGrade: "deterministic" },
  };
}

async function simulate(
  input: ROS2WorldStateInput,
  policy: NavigationScenarioPolicy,
  store = new InMemorySimulationArtifactStore(),
) {
  const captured = createROS2WorldSnapshot(input, { now: () => now, validityMs: 1_000 });
  if (!captured.ok) return captured;
  const persisted = await persistROS2WorldSnapshot(captured.value, store);
  if (!persisted.ok) return persisted;
  const simulator = new DeterministicEffectSimulator({
    signerPublicKey: signer.publicKey,
    signerPrivateKey: signer.privateKey,
    version: "0.1.0",
    modelDigest: "b".repeat(64),
    now: () => now,
    artifactStore: store,
    receiptRecorder: { recordIssued: async () => ok(undefined) },
    models: [new FixedCaseNavigationModel({
      resources: [resource],
      actions: [action],
      artifactStore: store,
      robotRadiusMeters: 0.2,
      minClearanceMeters: 0.1,
      maxVelocityMps: 0.6,
      maxHorizonMs: 3_000,
      maxHumanSpeedMps: 0.3,
      minDecelerationMps2: 2,
      reactionTimeMs: 100,
    }, policy)],
  });
  return simulator.simulate(preflight(), captured.value.snapshot);
}

const clearPolicy: NavigationScenarioPolicy = {
  version: "1.0.0",
  policyId: "seeded-clear-v1",
  cases: [{ id: "larger-footprint", extraRobotRadiusMeters: 0.05 }],
  distribution: {
    version: "1.0.0",
    seeds: [7, 11],
    bounds: {
      extraRobotRadiusMeters: { min: 0, max: 0.2 },
      extraReactionTimeMs: { min: 0, max: 50 },
      extraHumanSpeedMps: { min: 0, max: 0.2 },
    },
  },
};

describe("seeded navigation distribution conformance", () => {
  it("stores the approved seeds and treats coverage as conclusive runs", async () => {
    const store = new InMemorySimulationArtifactStore();
    const first = await simulate(scene(), clearPolicy, store);
    const second = await simulate(scene(), clearPolicy);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !("scenarios" in first.value) || !second.ok || !("scenarios" in second.value)) return;
    expect(first.value.result.outcome).toBe("pass");
    expect(first.value.scenarios).toMatchObject({
      scenarioSetDigest: navigationScenarioPolicyDigest(clearPolicy),
      runCount: 4,
      coverage: 1,
      seeds: [7, 11],
    });
    expect(second.value.scenarios.scenarioSetDigest).toBe(first.value.scenarios.scenarioSetDigest);
    expect(first.value.result.assumptions?.join(" ")).toContain("not a collision probability");
    const trace = await store.get(first.value.artifactDigest);
    expect(trace.ok).toBe(true);
    if (trace.ok) {
      const parsed = JSON.parse(trace.value.content) as { checks: Array<{ check: string }> };
      expect(parsed.checks.some((check) => check.check.startsWith("seed:7:perturbation"))).toBe(true);
      expect(parsed.checks.some((check) => check.check.startsWith("seed:11:perturbation"))).toBe(true);
    }
  });

  it("fails the aggregate when one seeded perturbation is unsafe", async () => {
    const policy: NavigationScenarioPolicy = {
      version: "1.0.0",
      policyId: "seeded-near-obstacle-v1",
      cases: [{ id: "small-localization-error", extraRobotRadiusMeters: 0.05 }],
      distribution: {
        version: "1.0.0",
        seeds: [3],
        bounds: {
          extraRobotRadiusMeters: { min: 0.25, max: 0.25 },
          extraReactionTimeMs: { min: 0, max: 0 },
          extraHumanSpeedMps: { min: 0, max: 0 },
        },
      },
    };
    const result = await simulate(scene({
      obstacles: [{
        id: "shelf",
        frameId: "map",
        kind: "static",
        position: { x: 0.5, y: 0.8, z: 0 },
        radiusMeters: 0.2,
        positionUncertaintyMeters: 0.05,
        observedAt,
      }],
    }), policy);
    expect(result.ok).toBe(true);
    if (!result.ok || !("scenarios" in result.value)) return;
    expect(result.value.result.outcome).toBe("fail");
    expect(result.value.scenarios).toMatchObject({ runCount: 3, seeds: [3] });
  });

  it("rejects a duplicated seed before issuing a receipt", async () => {
    const policy: NavigationScenarioPolicy = {
      version: "1.0.0",
      policyId: "duplicate-seed",
      cases: [{ id: "larger-footprint", extraRobotRadiusMeters: 0.05 }],
      distribution: {
        version: "1.0.0",
        seeds: [7, 7],
        bounds: {
          extraRobotRadiusMeters: { min: 0, max: 0.2 },
          extraReactionTimeMs: { min: 0, max: 0 },
          extraHumanSpeedMps: { min: 0, max: 0 },
        },
      },
    };
    const result = await simulate(scene(), policy);
    expect(result.ok ? undefined : result.error.code).toBe("SIMULATOR_MISCONFIGURED");
  });
});
