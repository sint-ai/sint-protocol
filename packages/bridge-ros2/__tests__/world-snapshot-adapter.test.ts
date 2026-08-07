import { describe, expect, it } from "vitest";
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

  it("rejects missing policy-required sources", () => {
    const captured = createROS2WorldSnapshot(state({ obstacles: undefined }), {
      now: () => now,
      requiredSources: ["obstacles"],
    });

    expect(captured.ok ? undefined : captured.error.code).toBe("WORLD_STATE_SOURCE_MISSING");
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
