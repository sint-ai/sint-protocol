import { describe, expect, it } from "vitest";
import { canonicalJsonStringify } from "@pshkv/core";
import { hashSha256 } from "@pshkv/gate-capability-tokens";
import {
  createROS2WorldSnapshot,
  persistROS2WorldSnapshot,
  type ROS2WorldStateInput,
} from "../src/index.js";

const now = Date.now();
const observedAt = new Date(now - 25).toISOString();
const capturedAt = new Date(now).toISOString();

function state(overrides: Partial<ROS2WorldStateInput> = {}): ROS2WorldStateInput {
  return {
    robotId: "mobile-base-1",
    frameId: "map",
    stateEpoch: "mobile-base-1:100",
    capturedAt,
    odometry: {
      observedAt,
      value: {
        pose: {
          position: { x: 1, y: 2, z: 0 },
          orientation: { x: 0, y: 0, z: 0, w: 1 },
        },
        twist: {
          linear: { x: 0.1, y: 0, z: 0 },
          angular: { x: 0, y: 0, z: 0.05 },
        },
      },
    },
    jointState: {
      observedAt,
      value: {
        name: ["left_wheel", "right_wheel"],
        position: [1.2, 1.2],
        velocity: [0.1, 0.1],
        effort: [],
      },
    },
    transforms: [{
      parentFrame: "map",
      childFrame: "base_link",
      observedAt,
      uncertainty: 0.02,
      pose: {
        position: { x: 1, y: 2, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
    }],
    map: {
      digest: "a".repeat(64),
      frameId: "map",
      observedAt,
      uncertainty: 0.01,
    },
    obstacles: [{
      id: "human-7",
      position: { x: 1.8, y: 2.2, z: 0 },
      radiusMeters: 0.35,
      observedAt,
      uncertainty: 0.08,
    }],
    safetyController: {
      controllerId: "safety-plc-1",
      observedAt,
      permitState: "granted",
      estopEngaged: false,
      protectiveStopEngaged: false,
      safetyZoneClear: true,
      stateDigest: "b".repeat(64),
      uncertainty: 0,
    },
    localizationConfidence: 0.95,
    ...overrides,
  };
}

describe("createROS2WorldSnapshot", () => {
  it("canonically binds synchronized robot, transform, map, obstacle, and safety state", () => {
    const captured = createROS2WorldSnapshot(state(), {
      now: () => now,
      validityMs: 750,
      maxUncertainty: 0.1,
      requiredSources: ["odometry", "jointState", "transforms", "map", "obstacles", "safetyController"],
    });

    expect(captured.ok).toBe(true);
    if (!captured.ok) return;
    expect(captured.value.snapshot).toMatchObject({
      stateEpoch: "mobile-base-1:100",
      observedAt: capturedAt,
      validUntil: new Date(now + 750).toISOString(),
      uncertainty: 0.08,
    });
    expect(captured.value.snapshot.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(captured.value.canonicalPayload)).toMatchObject({
      schemaVersion: "1.0.0",
      robotId: "mobile-base-1",
      safetyController: { controllerId: "safety-plc-1", permitState: "granted" },
    });
  });

  it("produces the same digest for the same canonical state", () => {
    const first = createROS2WorldSnapshot(state(), { now: () => now });
    const reordered = state();
    const second = createROS2WorldSnapshot({
      ...reordered,
      jointState: reordered.jointState
        ? {
            ...reordered.jointState,
            value: {
              name: [...reordered.jointState.value.name].reverse(),
              position: [...reordered.jointState.value.position].reverse(),
              velocity: [...reordered.jointState.value.velocity].reverse(),
              effort: [...reordered.jointState.value.effort].reverse(),
            },
          }
        : undefined,
      transforms: [...(reordered.transforms ?? [])].reverse(),
      obstacles: [...(reordered.obstacles ?? [])].reverse(),
    }, { now: () => now });

    expect(first.ok && second.ok ? first.value.snapshot.digest : undefined)
      .toBe(first.ok && second.ok ? second.value.snapshot.digest : "unreachable");
  });

  it("rejects stale component observations", () => {
    const captured = createROS2WorldSnapshot(state({
      map: {
        digest: "a".repeat(64),
        frameId: "map",
        observedAt: new Date(now - 5_000).toISOString(),
      },
    }), { now: () => now, maxInputAgeMs: 500 });

    expect(captured.ok ? undefined : captured.error.code).toBe("WORLD_STATE_SOURCE_STALE");
  });

  it("rejects a snapshot whose source clocks disagree", () => {
    const captured = createROS2WorldSnapshot(state({
      map: {
        digest: "a".repeat(64),
        frameId: "map",
        observedAt: new Date(now - 400).toISOString(),
      },
    }), { now: () => now, maxClockSkewMs: 250, maxInputAgeMs: 1_000 });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a snapshot whose state epoch names a different robot", () => {
    const captured = createROS2WorldSnapshot(state({
      stateEpoch: "other-robot:100",
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a snapshot whose state epoch does not name the robot", () => {
    const captured = createROS2WorldSnapshot(state({
      stateEpoch: "100",
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a snapshot whose state epoch has an empty counter", () => {
    const captured = createROS2WorldSnapshot(state({
      stateEpoch: "mobile-base-1:",
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a snapshot whose state epoch counter is not a canonical integer", () => {
    const captured = createROS2WorldSnapshot(state({
      stateEpoch: "mobile-base-1:latest",
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects missing policy-required sources", () => {
    const captured = createROS2WorldSnapshot(state({ obstacles: undefined }), {
      now: () => now,
      requiredSources: ["obstacles"],
    });

    expect(captured.ok ? undefined : captured.error.code).toBe("WORLD_STATE_SOURCE_MISSING");
  });

  it("accepts a fresh empty obstacle scan and rejects a stale one", () => {
    const clear = createROS2WorldSnapshot(state({ obstacles: [], obstacleScanObservedAt: observedAt }), {
      now: () => now,
      requiredSources: ["obstacles"],
    });
    expect(clear.ok).toBe(true);
    const stale = createROS2WorldSnapshot(state({
      obstacles: [],
      obstacleScanObservedAt: new Date(now - 5_000).toISOString(),
    }), { now: () => now, requiredSources: ["obstacles"] });
    expect(stale.ok ? undefined : stale.error.code).toBe("WORLD_STATE_SOURCE_STALE");
  });

  it("rejects a task binding whose payload digest is not a content hash", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      task: {
        phase: "transport",
        toolId: "gripper-1",
        payload: { payloadId: "crate-9", digest: "not-a-hash", radiusMeters: 0.4 },
        calibrationDigest: "c".repeat(64),
        policyDigest: "d".repeat(64),
      },
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("records phase, tool, payload geometry, and calibration and policy digests on the snapshot", () => {
    const task = {
      phase: "transport",
      toolId: "gripper-1",
      payload: { payloadId: "crate-9", digest: "e".repeat(64), radiusMeters: 0.4 },
      calibrationDigest: "c".repeat(64),
      policyDigest: "d".repeat(64),
    };
    const captured = createROS2WorldSnapshot({ ...state(), task }, { now: () => now });

    expect(captured.ok).toBe(true);
    if (!captured.ok) return;
    expect(captured.value.payload.task).toEqual(task);
    expect(JSON.parse(captured.value.canonicalPayload).task).toEqual(task);
    expect(captured.value.snapshot.digest).toBe(hashSha256(captured.value.canonicalPayload));
  });

  it("changes the snapshot digest when the payload is swapped", () => {
    const task = {
      phase: "transport",
      toolId: "gripper-1",
      payload: { payloadId: "crate-9", digest: "e".repeat(64), radiusMeters: 0.4 },
      calibrationDigest: "c".repeat(64),
      policyDigest: "d".repeat(64),
    };
    const original = createROS2WorldSnapshot({ ...state(), task }, { now: () => now });
    const swapped = createROS2WorldSnapshot({
      ...state(),
      task: {
        ...task,
        payload: { payloadId: "crate-10", digest: "f".repeat(64), radiusMeters: 0.4 },
      },
    }, { now: () => now });

    expect(original.ok && swapped.ok).toBe(true);
    if (!original.ok || !swapped.ok) return;
    expect(original.value.snapshot.digest).not.toBe(swapped.value.snapshot.digest);
  });

  it("versions sensor provenance on the canonical snapshot", () => {
    const sensors = [{
      sensorId: "lidar-front",
      version: "2.4.1",
      source: "obstacles" as const,
      observedAt,
    }];
    const captured = createROS2WorldSnapshot({
      ...state(),
      sensors,
    } as ROS2WorldStateInput, { now: () => now });

    expect(captured.ok).toBe(true);
    if (!captured.ok) return;
    const payload = captured.value.payload as ROS2WorldStateInput & {
      sensorProvenance?: { schemaVersion: string; sensors: typeof sensors };
      sensors?: typeof sensors;
    };
    expect(payload.sensorProvenance).toEqual({
      schemaVersion: "1.0.0",
      sensors,
    });
    expect(JSON.parse(captured.value.canonicalPayload).sensorProvenance).toEqual({
      schemaVersion: "1.0.0",
      sensors,
    });
    expect(JSON.parse(captured.value.canonicalPayload).sensors).toBeUndefined();
    expect(captured.value.snapshot.digest).toBe(hashSha256(captured.value.canonicalPayload));
  });

  it("rejects sensor provenance with a missing source identity", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      sensors: [{
        sensorId: "",
        version: "2.4.1",
        source: "obstacles" as const,
        observedAt,
      }],
    } as ROS2WorldStateInput, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects sensor provenance whose source is not a world-state channel", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      sensors: [{
        sensorId: "lidar-front",
        version: "2.4.1",
        source: "camera" as "obstacles",
        observedAt,
      }],
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects duplicate sensor ids on the canonical snapshot", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      sensors: [
        {
          sensorId: "lidar-front",
          version: "2.4.1",
          source: "obstacles" as const,
          observedAt,
        },
        {
          sensorId: "lidar-front",
          version: "2.4.2",
          source: "map" as const,
          observedAt,
        },
      ],
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("commits a scene contract digest over the versioned task, provenance, and occupancy", () => {
    const task = {
      phase: "transport",
      toolId: "gripper-1",
      payload: { payloadId: "crate-9", digest: "e".repeat(64), radiusMeters: 0.4 },
      calibrationDigest: "c".repeat(64),
      policyDigest: "d".repeat(64),
    };
    const sensors = [{
      sensorId: "lidar-front",
      version: "2.4.1",
      source: "obstacles" as const,
      observedAt,
    }];
    const regions = [{
      regionId: "corridor-a",
      occupied: true,
      occlusion: "partial" as const,
      observedAt,
    }];
    const captured = createROS2WorldSnapshot({
      ...state(),
      task,
      sensors,
      occupancy: regions,
    }, { now: () => now });

    expect(captured.ok).toBe(true);
    if (!captured.ok) return;
    const payload = JSON.parse(captured.value.canonicalPayload) as {
      task?: typeof task;
      sensorProvenance?: { schemaVersion: string; sensors: typeof sensors };
      occupancyOcclusion?: { schemaVersion: string; regions: typeof regions };
    };
    const contract = canonicalJsonStringify({
      occupancyOcclusion: payload.occupancyOcclusion ?? null,
      sensorProvenance: payload.sensorProvenance ?? null,
      task: payload.task ?? null,
    });
    expect(captured.value.snapshot.sceneContractDigest).toBe(hashSha256(contract));

    const swapped = createROS2WorldSnapshot({
      ...state(),
      task: { ...task, phase: "place" },
      sensors,
      occupancy: regions,
    }, { now: () => now });
    expect(swapped.ok).toBe(true);
    if (!swapped.ok) return;
    expect(swapped.value.snapshot.sceneContractDigest).not.toBe(captured.value.snapshot.sceneContractDigest);
  });

  it("versions occupancy and occlusion on the canonical snapshot", () => {
    const regions = [{
      regionId: "corridor-a",
      occupied: true,
      occlusion: "partial" as const,
      observedAt,
    }];
    const captured = createROS2WorldSnapshot({
      ...state(),
      occupancy: regions,
    } as ROS2WorldStateInput, { now: () => now });

    expect(captured.ok).toBe(true);
    if (!captured.ok) return;
    const payload = captured.value.payload as ROS2WorldStateInput & {
      occupancyOcclusion?: { schemaVersion: string; regions: typeof regions };
      occupancy?: typeof regions;
    };
    expect(payload.occupancyOcclusion).toEqual({
      schemaVersion: "1.0.0",
      regions,
    });
    expect(JSON.parse(captured.value.canonicalPayload).occupancyOcclusion).toEqual({
      schemaVersion: "1.0.0",
      regions,
    });
    expect(JSON.parse(captured.value.canonicalPayload).occupancy).toBeUndefined();
    expect(captured.value.snapshot.digest).toBe(hashSha256(captured.value.canonicalPayload));
  });

  it("rejects occupancy whose occlusion state is missing", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      occupancy: [{
        regionId: "corridor-a",
        occupied: true,
        occlusion: undefined as unknown as "partial",
        observedAt,
      }],
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects occupancy whose occlusion state is invalid", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      occupancy: [{
        regionId: "corridor-a",
        occupied: true,
        occlusion: "blocked" as "partial",
        observedAt,
      }],
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a cross-source frame mismatch on the canonical snapshot", () => {
    const captured = createROS2WorldSnapshot(state({
      odometry: {
        observedAt,
        frameId: "odom",
        value: {
          pose: {
            position: { x: 1, y: 2, z: 0 },
            orientation: { x: 0, y: 0, z: 0, w: 1 },
          },
          twist: {
            linear: { x: 0.1, y: 0, z: 0 },
            angular: { x: 0, y: 0, z: 0.05 },
          },
        },
      },
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects misaligned joint arrays", () => {
    const captured = createROS2WorldSnapshot(state({
      jointState: {
        observedAt,
        value: { name: ["left", "right"], position: [1], velocity: [], effort: [] },
      },
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("fails when aggregated uncertainty exceeds the deployment limit", () => {
    const captured = createROS2WorldSnapshot(state(), { now: () => now, maxUncertainty: 0.05 });

    expect(captured.ok ? undefined : captured.error.code).toBe("WORLD_STATE_UNCERTAINTY_EXCEEDED");
  });

  it("persists the canonical payload under the snapshot digest", async () => {
    const captured = createROS2WorldSnapshot(state(), { now: () => now });
    expect(captured.ok).toBe(true);
    if (!captured.ok) return;
    const artifacts = new Map<string, { mediaType: string; content: string }>();
    const store = {
      put: async (artifact: { mediaType: string; content: string }) => {
        const digest = hashSha256(artifact.content);
        artifacts.set(digest, artifact);
        return {
          ok: true as const,
          value: {
            digest,
            mediaType: artifact.mediaType,
            sizeBytes: new TextEncoder().encode(artifact.content).byteLength,
          },
        };
      },
      get: async (digest: string) => {
        const artifact = artifacts.get(digest);
        return artifact
          ? { ok: true as const, value: artifact }
          : {
              ok: false as const,
              error: { code: "ARTIFACT_NOT_FOUND" as const, message: "not found" },
            };
      },
    };

    const persisted = await persistROS2WorldSnapshot(captured.value, store);
    expect(persisted.ok).toBe(true);
    expect(artifacts.get(captured.value.snapshot.digest)?.content).toBe(captured.value.canonicalPayload);
  });
});
