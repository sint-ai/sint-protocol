import { describe, expect, it } from "vitest";
import { ApprovalTier, canonicalJsonStringify, ok, type SimulationPreflight } from "@pshkv/core";
import { generateKeypair, hashSha256 } from "@pshkv/gate-capability-tokens";
import { createROS2WorldSnapshot, persistROS2WorldSnapshot, type ROS2WorldStateInput } from "@pshkv/bridge-ros2";
import {
  DeterministicEffectSimulator,
  FixedCaseNavigationModel,
  InMemorySimulationArtifactStore,
  SceneAwareNavigationModel,
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

function preflight(params: Record<string, unknown> = { robotId: "mobile-1", frameId: "map", target: { x: 1, y: 0, z: 0 }, velocityMps: 0.5 }): SimulationPreflight {
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
  params?: Record<string, unknown>,
  policy?: NavigationScenarioPolicy,
  store = new InMemorySimulationArtifactStore(),
) {
  const captured = createROS2WorldSnapshot(input, { now: () => now, validityMs: 1_000 });
  if (!captured.ok) return captured;
  const persisted = await persistROS2WorldSnapshot(captured.value, store);
  if (!persisted.ok) return persisted;
  const modelOptions = {
    resources: [resource], actions: [action], artifactStore: store,
    robotRadiusMeters: 0.2, minClearanceMeters: 0.1, maxVelocityMps: 0.6,
    maxHorizonMs: 3_000, maxHumanSpeedMps: 0.3,
    minDecelerationMps2: 2, reactionTimeMs: 100,
  };
  const simulator = new DeterministicEffectSimulator({
    signerPublicKey: signer.publicKey,
    signerPrivateKey: signer.privateKey,
    version: "0.1.0",
    modelDigest: "b".repeat(64),
    now: () => now,
    artifactStore: store,
    receiptRecorder: { recordIssued: async () => ok(undefined) },
    models: [policy
      ? new FixedCaseNavigationModel(modelOptions, policy)
      : new SceneAwareNavigationModel(modelOptions)],
  });
  return simulator.simulate(preflight(params), captured.value.snapshot);
}

describe("scene-aware navigation conformance", () => {
  it("reports full fixed-case coverage only after every case runs conclusively", async () => {
    const policy: NavigationScenarioPolicy = {
      version: "1.0.0", policyId: "clear-scene-v1",
      cases: [
        { id: "larger-footprint", extraRobotRadiusMeters: 0.1 },
        { id: "slow-reaction", extraReactionTimeMs: 100 },
      ],
    };
    const result = await simulate(scene(), undefined, policy);
    expect(result.ok).toBe(true);
    if (!result.ok || !("scenarios" in result.value)) return;
    expect(result.value.result.outcome).toBe("pass");
    expect(result.value.scenarios).toMatchObject({
      scenarioSetDigest: navigationScenarioPolicyDigest(policy), runCount: 3, coverage: 1, seeds: [],
    });
  });

  it("runs a digest-bound fixed case set and fails when one stress case is unsafe", async () => {
    const store = new InMemorySimulationArtifactStore();
    const policy: NavigationScenarioPolicy = {
      version: "1.0.0", policyId: "near-obstacle-v1",
      cases: [
        { id: "small-localization-error", extraRobotRadiusMeters: 0.05 },
        { id: "large-localization-error", extraRobotRadiusMeters: 0.25 },
      ],
    };
    const result = await simulate(scene({ obstacles: [{
      id: "shelf", frameId: "map", kind: "static", position: { x: 0.5, y: 0.8, z: 0 },
      radiusMeters: 0.2, positionUncertaintyMeters: 0.05, observedAt,
    }] }), undefined, policy, store);
    expect(result.ok).toBe(true);
    if (!result.ok || !("scenarios" in result.value)) return;
    expect(result.value.result.outcome).toBe("fail");
    expect(result.value.scenarios).toMatchObject({
      scenarioSetDigest: navigationScenarioPolicyDigest(policy), runCount: 3, coverage: 1, seeds: [],
    });
    const trace = await store.get(result.value.artifactDigest);
    expect(trace.ok).toBe(true);
    if (trace.ok) {
      const parsed = JSON.parse(trace.value.content) as { scenarioPolicy: NavigationScenarioPolicy; checks: Array<{ check: string }> };
      expect(parsed.scenarioPolicy).toEqual(policy);
      expect(parsed.checks.some((check) => check.check.startsWith("large-localization-error:"))).toBe(true);
    }
  });

  it("reports incomplete fixed-case coverage when a stress case is indeterminate", async () => {
    const policy: NavigationScenarioPolicy = {
      version: "1.0.0", policyId: "reaction-delay-v1",
      cases: [{ id: "long-reaction-delay", extraReactionTimeMs: 4_000 }],
    };
    const result = await simulate(scene(), undefined, policy);
    expect(result.ok).toBe(true);
    if (!result.ok || !("scenarios" in result.value)) return;
    expect(result.value.result.outcome).toBe("indeterminate");
    expect(result.value.scenarios).toMatchObject({ runCount: 2, coverage: 0.5, seeds: [] });
  });

  it("rejects an invalid fixed-case policy before issuing a receipt", async () => {
    const policy: NavigationScenarioPolicy = {
      version: "1.0.0", policyId: "invalid",
      cases: [{ id: "no-stress" }],
    };
    const result = await simulate(scene(), undefined, policy);
    expect(result.ok ? undefined : result.error.code).toBe("SIMULATOR_MISCONFIGURED");
  });

  it("passes a clear short segment with a digest-bound sensor scene", async () => {
    const result = await simulate(scene());
    expect(result.ok).toBe(true);
    if (!result.ok || !('result' in result.value)) return;
    expect(result.value.result).toMatchObject({ outcome: "pass", collisions: 0 });
    expect(result.value.result.minClearanceMeters).toBeGreaterThan(1);
  });

  it("fails a crossing moving obstacle before the robot moves", async () => {
    const result = await simulate(scene({ obstacles: [{
      id: "cart",
      frameId: "map",
      kind: "dynamic",
      position: { x: 0.5, y: -1, z: 0 },
      velocityMps: { x: 0, y: 1, z: 0 },
      velocityUncertaintyMps: 0.1,
      radiusMeters: 0.2,
      positionUncertaintyMeters: 0.05,
      observedAt,
    }] }));
    expect(result.ok && 'result' in result.value ? result.value.result.outcome : undefined).toBe("fail");
  });

  it("checks every waypoint leg against the same scene", async () => {
    const result = await simulate(scene({ obstacles: [{
      id: "second-leg-shelf", frameId: "map", kind: "static", position: { x: 0.75, y: 0, z: 0 },
      radiusMeters: 0.1, positionUncertaintyMeters: 0.02, observedAt,
    }] }), {
      robotId: "mobile-1", frameId: "map", velocityMps: 0.5,
      waypoints: [{ x: 0.5, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }],
    });
    expect(result.ok && "result" in result.value ? result.value.result.outcome : undefined).toBe("fail");
  });

  it("returns indeterminate for a turn without a controller dynamics model", async () => {
    const result = await simulate(scene(), {
      robotId: "mobile-1", frameId: "map", velocityMps: 0.5,
      waypoints: [{ x: 0.5, y: 0, z: 0 }, { x: 0.5, y: 0.5, z: 0 }],
    });
    expect(result.ok && "result" in result.value ? result.value.result.outcome : undefined).toBe("indeterminate");
  });

  it("checks the conservative stopping corridor beyond the final waypoint", async () => {
    const result = await simulate(scene({ obstacles: [{
      id: "after-target", frameId: "map", kind: "static", position: { x: 1.22, y: 0, z: 0 },
      radiusMeters: 0.02, positionUncertaintyMeters: 0.01, observedAt,
    }] }));
    expect(result.ok && "result" in result.value ? result.value.result.outcome : undefined).toBe("fail");
  });

  it("returns indeterminate when the path and stop corridor exceed the scene horizon", async () => {
    const result = await simulate(scene(), {
      robotId: "mobile-1", frameId: "map", velocityMps: 0.5,
      waypoints: [{ x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }],
    });
    expect(result.ok && "result" in result.value ? result.value.result.outcome : undefined).toBe("indeterminate");
  });

  it("projects a moving obstacle from its observation time to the scene time", async () => {
    // 200ms is inside the 250ms source-clock budget. The start pose is the
    // old 900ms track advanced by 700ms, so the scene-time position is unchanged.
    const result = await simulate(scene({ obstacles: [{
      id: "older-cart-track",
      frameId: "map",
      kind: "dynamic",
      position: { x: 0.5, y: -1.8, z: 0 },
      velocityMps: { x: 0, y: 1, z: 0 },
      velocityUncertaintyMps: 0.1,
      radiusMeters: 0.2,
      positionUncertaintyMeters: 0.05,
      observedAt: new Date(now - 200).toISOString(),
    }] }));
    expect(result.ok && 'result' in result.value ? result.value.result.outcome : undefined).toBe("fail");
  });

  it("rejects an obstacle clock that disagrees with the rest of the scene", async () => {
    const result = await simulate(scene({ obstacles: [{
      id: "skewed-cart",
      frameId: "map",
      kind: "dynamic",
      position: { x: 0.5, y: -2.5, z: 0 },
      velocityMps: { x: 0, y: 1, z: 0 },
      velocityUncertaintyMps: 0.1,
      radiusMeters: 0.2,
      positionUncertaintyMeters: 0.05,
      observedAt: new Date(now - 900).toISOString(),
    }] }));
    expect(result.ok ? undefined : result.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("fails when bounded velocity uncertainty could bring a moving object into the path", async () => {
    const result = await simulate(scene({ obstacles: [{
      id: "uncertain-cart", frameId: "map", kind: "dynamic", position: { x: 0.5, y: 0.8, z: 0 },
      velocityMps: { x: 0, y: 0, z: 0 }, velocityUncertaintyMps: 0.3,
      radiusMeters: 0.1, positionUncertaintyMeters: 0.02, observedAt,
    }] }));
    expect(result.ok && "result" in result.value ? result.value.result.outcome : undefined).toBe("fail");
  });

  it("returns indeterminate for a moving object without a velocity error bound", async () => {
    const result = await simulate(scene({ obstacles: [{
      id: "unbounded-cart", frameId: "map", kind: "dynamic", position: { x: 0.5, y: 2, z: 0 },
      velocityMps: { x: 0, y: 0, z: 0 },
      radiusMeters: 0.1, positionUncertaintyMeters: 0.02, observedAt,
    }] }));
    expect(result.ok && "result" in result.value ? result.value.result.outcome : undefined).toBe("indeterminate");
  });

  it("expands a person's reachable region beyond the most likely stationary path", async () => {
    const result = await simulate(scene({ obstacles: [{
      id: "worker",
      frameId: "map",
      kind: "human",
      position: { x: 0.5, y: 0.8, z: 0 },
      radiusMeters: 0.2,
      positionUncertaintyMeters: 0.05,
      observedAt,
    }] }));
    expect(result.ok && 'result' in result.value ? result.value.result.outcome : undefined).toBe("fail");
  });

  it("refuses to trust a human prediction above the calibrated speed bound", async () => {
    const result = await simulate(scene({ obstacles: [{
      id: "runner",
      frameId: "map",
      kind: "human",
      position: { x: 0.5, y: 2, z: 0 },
      velocityMps: { x: 0, y: -1, z: 0 },
      radiusMeters: 0.2,
      positionUncertaintyMeters: 0.05,
      observedAt,
    }] }));
    expect(result.ok && 'result' in result.value ? result.value.result.outcome : undefined).toBe("indeterminate");
  });

  it("returns indeterminate rather than passing an unclassified obstacle", async () => {
    const input = scene();
    const result = await simulate({ ...input, obstacles: input.obstacles?.map((obstacle) => ({ ...obstacle, kind: undefined })) });
    expect(result.ok && 'result' in result.value ? result.value.result.outcome : undefined).toBe("indeterminate");
  });

  it("returns indeterminate when an empty obstacle list has no scan timestamp", async () => {
    const result = await simulate(scene({ obstacles: [], obstacleScanObservedAt: undefined }));
    expect(result.ok && 'result' in result.value ? result.value.result.outcome : undefined).toBe("indeterminate");
  });

  it("rejects a scene for another robot even when its geometry is clear", async () => {
    const result = await simulate(scene({ robotId: "other-robot", stateEpoch: "other-robot:42" }));
    expect(result.ok && 'result' in result.value ? result.value.result.outcome : undefined).toBe("indeterminate");
  });

  it("rejects odometry in a different coordinate frame before the simulator", async () => {
    const input = scene();
    const result = await simulate({ ...input, odometry: { ...input.odometry!, frameId: "odom" } });
    expect(result.ok ? undefined : result.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects an obstacle in a different coordinate frame before the simulator", async () => {
    const input = scene();
    const result = await simulate({ ...input, obstacles: input.obstacles!.map((obstacle) => ({ ...obstacle, frameId: "camera" })) });
    expect(result.ok ? undefined : result.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a stale obstacle scan before issuing a receipt", async () => {
    const result = await simulate(scene({ obstacleScanObservedAt: new Date(now - 5_000).toISOString() }));
    expect(result.ok ? undefined : result.error.code).toBe("WORLD_STATE_SOURCE_STALE");
  });

  it("fails on a controller protective stop", async () => {
    const input = scene();
    const result = await simulate({ ...input, safetyController: { ...input.safetyController!, protectiveStopEngaged: true } });
    expect(result.ok && 'result' in result.value ? result.value.result.outcome : undefined).toBe("fail");
  });

  it("rejects a snapshot artifact whose content does not match its digest", async () => {
    const model = new SceneAwareNavigationModel({
      resources: [resource],
      actions: [action],
      artifactStore: {
        get: async () => ok({
          mediaType: "application/vnd.sint.ros2-world-snapshot+json;version=1",
          content: "{}",
        }),
        put: async () => ok({ digest: "0".repeat(64), mediaType: "x", sizeBytes: 2 }),
      },
      robotRadiusMeters: 0.2,
      minClearanceMeters: 0.1,
      maxVelocityMps: 0.6,
      maxHorizonMs: 3_000,
      maxHumanSpeedMps: 0.3,
      minDecelerationMps2: 2,
      reactionTimeMs: 100,
    });
    const evaluated = await model.evaluate(preflight().effectPlan, {
      digest: "a".repeat(64),
      observedAt: capturedAt,
      validUntil: new Date(now + 1_000).toISOString(),
      stateEpoch: "mobile-1:42",
    });
    expect(evaluated.ok ? undefined : evaluated.error.code).toBe("SIMULATION_FAILED");
  });
});
