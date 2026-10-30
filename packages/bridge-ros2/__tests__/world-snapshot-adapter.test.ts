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

  it("rejects a robot identity that is only whitespace", () => {
    const captured = createROS2WorldSnapshot(state({
      robotId: "   ",
      stateEpoch: "   :100",
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a robot identity with leading or trailing whitespace", () => {
    const captured = createROS2WorldSnapshot(state({
      robotId: " mobile-base-1",
      stateEpoch: " mobile-base-1:100",
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a robot identity that is empty", () => {
    const captured = createROS2WorldSnapshot(state({
      robotId: "",
      stateEpoch: ":100",
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a snapshot frame that is only whitespace", () => {
    const captured = createROS2WorldSnapshot(state({
      frameId: "   ",
      map: undefined,
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a snapshot frame with leading or trailing whitespace", () => {
    const captured = createROS2WorldSnapshot(state({
      frameId: " map",
      map: undefined,
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a safety-controller identity that is only whitespace", () => {
    const captured = createROS2WorldSnapshot(state({
      safetyController: {
        controllerId: "   ",
        observedAt,
        permitState: "granted",
        estopEngaged: false,
        protectiveStopEngaged: false,
        safetyZoneClear: true,
        stateDigest: "b".repeat(64),
        uncertainty: 0,
      },
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a safety-controller identity with leading or trailing whitespace", () => {
    const captured = createROS2WorldSnapshot(state({
      safetyController: {
        controllerId: " safety-plc-1",
        observedAt,
        permitState: "granted",
        estopEngaged: false,
        protectiveStopEngaged: false,
        safetyZoneClear: true,
        stateDigest: "b".repeat(64),
        uncertainty: 0,
      },
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a safety-controller digest that is missing", () => {
    const captured = createROS2WorldSnapshot(state({
      safetyController: {
        controllerId: "safety-plc-1",
        observedAt,
        permitState: "granted",
        estopEngaged: false,
        protectiveStopEngaged: false,
        safetyZoneClear: true,
        stateDigest: undefined as unknown as string,
        uncertainty: 0,
      },
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a safety-controller permit state that is not granted, denied, or unknown", () => {
    const captured = createROS2WorldSnapshot(state({
      safetyController: {
        controllerId: "safety-plc-1",
        observedAt,
        permitState: "allow" as unknown as "granted",
        estopEngaged: false,
        protectiveStopEngaged: false,
        safetyZoneClear: true,
        stateDigest: "b".repeat(64),
        uncertainty: 0,
      },
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a safety-controller estop flag that is not a boolean", () => {
    const captured = createROS2WorldSnapshot(state({
      safetyController: {
        controllerId: "safety-plc-1",
        observedAt,
        permitState: "granted",
        estopEngaged: "no" as unknown as boolean,
        protectiveStopEngaged: false,
        safetyZoneClear: true,
        stateDigest: "b".repeat(64),
        uncertainty: 0,
      },
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a safety-controller protective-stop flag that is not a boolean", () => {
    const captured = createROS2WorldSnapshot(state({
      safetyController: {
        controllerId: "safety-plc-1",
        observedAt,
        permitState: "granted",
        estopEngaged: false,
        protectiveStopEngaged: "no" as unknown as boolean,
        safetyZoneClear: true,
        stateDigest: "b".repeat(64),
        uncertainty: 0,
      },
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a safety-controller safety-zone flag that is not a boolean", () => {
    const captured = createROS2WorldSnapshot(state({
      safetyController: {
        controllerId: "safety-plc-1",
        observedAt,
        permitState: "granted",
        estopEngaged: false,
        protectiveStopEngaged: false,
        safetyZoneClear: "no" as unknown as boolean,
        stateDigest: "b".repeat(64),
        uncertainty: 0,
      },
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a safety-controller observation time that is missing", () => {
    const captured = createROS2WorldSnapshot(state({
      safetyController: {
        controllerId: "safety-plc-1",
        observedAt: undefined as unknown as string,
        permitState: "granted",
        estopEngaged: false,
        protectiveStopEngaged: false,
        safetyZoneClear: true,
        stateDigest: "b".repeat(64),
        uncertainty: 0,
      },
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects an odometry observation time that is missing", () => {
    const base = state();
    const captured = createROS2WorldSnapshot(state({
      odometry: {
        ...base.odometry!,
        observedAt: undefined as unknown as string,
      },
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a joint-state observation time that is missing", () => {
    const base = state();
    const captured = createROS2WorldSnapshot(state({
      jointState: {
        ...base.jointState!,
        observedAt: undefined as unknown as string,
      },
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a transform observation time that is missing", () => {
    const base = state();
    const captured = createROS2WorldSnapshot(state({
      transforms: [{
        ...base.transforms![0]!,
        observedAt: undefined as unknown as string,
      }],
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a map observation time that is missing", () => {
    const captured = createROS2WorldSnapshot(state({
      map: {
        digest: "a".repeat(64),
        frameId: "map",
        observedAt: undefined as unknown as string,
        uncertainty: 0.01,
      },
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects an obstacle observation time that is missing", () => {
    const captured = createROS2WorldSnapshot(state({
      obstacles: [{
        id: "human-7",
        position: { x: 1.8, y: 2.2, z: 0 },
        radiusMeters: 0.35,
        observedAt: undefined as unknown as string,
        uncertainty: 0.08,
      }],
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects an obstacle observation time that is only whitespace", () => {
    const captured = createROS2WorldSnapshot(state({
      obstacles: [{
        id: "human-7",
        position: { x: 1.8, y: 2.2, z: 0 },
        radiusMeters: 0.35,
        observedAt: "  ",
        uncertainty: 0.08,
      }],
    }), { now: () => now });

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

  it("rejects an empty obstacle scan whose observation time is only whitespace", () => {
    const captured = createROS2WorldSnapshot(state({
      obstacles: [],
      obstacleScanObservedAt: "  ",
    }), { now: () => now, requiredSources: ["obstacles"] });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects an empty obstacle scan whose observation time is not a string", () => {
    const captured = createROS2WorldSnapshot(state({
      obstacles: [],
      obstacleScanObservedAt: 1 as unknown as string,
    }), { now: () => now, requiredSources: ["obstacles"] });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a snapshot whose capture time is only whitespace", () => {
    const captured = createROS2WorldSnapshot(state({
      capturedAt: "  ",
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a snapshot whose capture time is not a string", () => {
    const captured = createROS2WorldSnapshot(state({
      capturedAt: 1 as unknown as string,
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
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

  it("rejects a task binding whose tool identity is only whitespace", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      task: {
        phase: "transport",
        toolId: "   ",
        payload: { payloadId: "crate-9", digest: "e".repeat(64), radiusMeters: 0.4 },
        calibrationDigest: "c".repeat(64),
        policyDigest: "d".repeat(64),
      },
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a task binding whose tool identity has leading or trailing whitespace", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      task: {
        phase: "transport",
        toolId: " gripper-1",
        payload: { payloadId: "crate-9", digest: "e".repeat(64), radiusMeters: 0.4 },
        calibrationDigest: "c".repeat(64),
        policyDigest: "d".repeat(64),
      },
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a task binding whose phase has leading or trailing whitespace", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      task: {
        phase: " transport",
        toolId: "gripper-1",
        payload: { payloadId: "crate-9", digest: "e".repeat(64), radiusMeters: 0.4 },
        calibrationDigest: "c".repeat(64),
        policyDigest: "d".repeat(64),
      },
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a task binding whose phase is only whitespace", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      task: {
        phase: "   ",
        toolId: "gripper-1",
        payload: { payloadId: "crate-9", digest: "e".repeat(64), radiusMeters: 0.4 },
        calibrationDigest: "c".repeat(64),
        policyDigest: "d".repeat(64),
      },
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a task binding whose payload identity is only whitespace", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      task: {
        phase: "transport",
        toolId: "gripper-1",
        payload: { payloadId: "   ", digest: "e".repeat(64), radiusMeters: 0.4 },
        calibrationDigest: "c".repeat(64),
        policyDigest: "d".repeat(64),
      },
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a task binding whose payload identity has leading or trailing whitespace", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      task: {
        phase: "transport",
        toolId: "gripper-1",
        payload: { payloadId: " crate-9", digest: "e".repeat(64), radiusMeters: 0.4 },
        calibrationDigest: "c".repeat(64),
        policyDigest: "d".repeat(64),
      },
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a task calibration digest that is not lowercase hex", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      task: {
        phase: "transport",
        toolId: "gripper-1",
        payload: { payloadId: "crate-9", digest: "e".repeat(64), radiusMeters: 0.4 },
        calibrationDigest: "C".repeat(64),
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

  it("rejects sensor provenance whose identity is only whitespace", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      sensors: [{
        sensorId: "   ",
        version: "2.4.1",
        source: "obstacles" as const,
        observedAt,
      }],
    } as ROS2WorldStateInput, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects sensor provenance whose identity has leading or trailing whitespace", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      sensors: [{
        sensorId: " lidar-front",
        version: "2.4.1",
        source: "obstacles" as const,
        observedAt,
      }],
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects sensor provenance whose version is missing", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      sensors: [{
        sensorId: "lidar-front",
        version: "",
        source: "obstacles" as const,
        observedAt,
      }],
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects sensor provenance whose version is only whitespace", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      sensors: [{
        sensorId: "lidar-front",
        version: "   ",
        source: "obstacles" as const,
        observedAt,
      }],
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects sensor provenance whose version has leading or trailing whitespace", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      sensors: [{
        sensorId: "lidar-front",
        version: " 2.4.1",
        source: "obstacles" as const,
        observedAt,
      }],
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects sensor provenance whose observation time is missing", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      sensors: [{
        sensorId: "lidar-front",
        version: "2.4.1",
        source: "obstacles" as const,
        observedAt: undefined as unknown as string,
      }],
    }, { now: () => now });

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

  it("rejects sensor ids that collide after trimming", () => {
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
          sensorId: " lidar-front",
          version: "2.4.2",
          source: "map" as const,
          observedAt,
        },
      ],
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects sensor provenance that names a world-state source the snapshot does not contain", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      map: undefined,
      sensors: [{
        sensorId: "map-lidar",
        version: "2.4.1",
        source: "map" as const,
        observedAt,
      }],
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a fresh snapshot whose sensor provenance time is stale", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      sensors: [{
        sensorId: "lidar-front",
        version: "2.4.1",
        source: "obstacles" as const,
        observedAt: new Date(now - 5_000).toISOString(),
      }],
    }, { now: () => now, maxInputAgeMs: 500 });

    expect(captured.ok ? undefined : captured.error.code).toBe("WORLD_STATE_SOURCE_STALE");
  });

  it("rejects a fresh snapshot whose occupancy time is not a timestamp", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      occupancy: [{
        regionId: "corridor-a",
        occupied: true,
        occlusion: "partial" as const,
        observedAt: "not-a-time",
      }],
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("WORLD_STATE_SOURCE_STALE");
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

  it("rejects an occupancy observation time that is missing", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      occupancy: [{
        regionId: "corridor-a",
        occupied: true,
        occlusion: "partial" as const,
        observedAt: undefined as unknown as string,
      }],
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects an occupancy observation time that is only whitespace", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      occupancy: [{
        regionId: "corridor-a",
        occupied: true,
        occlusion: "partial" as const,
        observedAt: "  ",
      }],
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects occupancy whose region identity is missing", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      occupancy: [{
        regionId: "",
        occupied: true,
        occlusion: "partial" as const,
        observedAt,
      }],
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects occupancy whose region identity is only whitespace", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      occupancy: [{
        regionId: "   ",
        occupied: true,
        occlusion: "partial" as const,
        observedAt,
      }],
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects an occupancy region id with leading or trailing whitespace", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      occupancy: [{
        regionId: " corridor-a",
        occupied: true,
        occlusion: "partial" as const,
        observedAt,
      }],
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects occupancy whose occupied flag is not a boolean", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      occupancy: [{
        regionId: "corridor-a",
        occupied: "yes" as unknown as boolean,
        occlusion: "partial" as const,
        observedAt,
      }],
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects duplicate occupancy region ids on the canonical snapshot", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      occupancy: [
        {
          regionId: "corridor-a",
          occupied: true,
          occlusion: "partial" as const,
          observedAt,
        },
        {
          regionId: "corridor-a",
          occupied: false,
          occlusion: "clear" as const,
          observedAt,
        },
      ],
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects occupancy region ids that collide after trimming", () => {
    const captured = createROS2WorldSnapshot({
      ...state(),
      occupancy: [
        {
          regionId: "corridor-a",
          occupied: true,
          occlusion: "partial" as const,
          observedAt,
        },
        {
          regionId: " corridor-a",
          occupied: false,
          occlusion: "clear" as const,
          observedAt,
        },
      ],
    }, { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("produces the same digest when occupancy regions are reordered", () => {
    const corridor = {
      regionId: "corridor-a",
      occupied: true,
      occlusion: "partial" as const,
      observedAt,
    };
    const dock = {
      regionId: "dock-b",
      occupied: false,
      occlusion: "clear" as const,
      observedAt,
    };
    const forward = createROS2WorldSnapshot({
      ...state(),
      occupancy: [corridor, dock],
    }, { now: () => now });
    const reversed = createROS2WorldSnapshot({
      ...state(),
      occupancy: [dock, corridor],
    }, { now: () => now });

    expect(forward.ok && reversed.ok).toBe(true);
    if (!forward.ok || !reversed.ok) return;
    expect(forward.value.snapshot.digest).toBe(reversed.value.snapshot.digest);
    expect(forward.value.snapshot.sceneContractDigest).toBe(reversed.value.snapshot.sceneContractDigest);
  });

  it("produces the same digest when sensor provenance entries are reordered", () => {
    const lidar = {
      sensorId: "lidar-front",
      version: "2.4.1",
      source: "obstacles" as const,
      observedAt,
    };
    const mapSensor = {
      sensorId: "map-lidar",
      version: "1.0.0",
      source: "map" as const,
      observedAt,
    };
    const forward = createROS2WorldSnapshot({
      ...state(),
      sensors: [lidar, mapSensor],
    }, { now: () => now });
    const reversed = createROS2WorldSnapshot({
      ...state(),
      sensors: [mapSensor, lidar],
    }, { now: () => now });

    expect(forward.ok && reversed.ok).toBe(true);
    if (!forward.ok || !reversed.ok) return;
    expect(forward.value.snapshot.digest).toBe(reversed.value.snapshot.digest);
    expect(forward.value.snapshot.sceneContractDigest).toBe(reversed.value.snapshot.sceneContractDigest);
  });

  it("rejects an odometry frame that is only whitespace", () => {
    const base = state();
    const captured = createROS2WorldSnapshot(state({
      frameId: "   ",
      map: undefined,
      odometry: {
        ...base.odometry!,
        frameId: "   ",
      },
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects an obstacle frame that is only whitespace", () => {
    const captured = createROS2WorldSnapshot(state({
      frameId: "   ",
      map: undefined,
      obstacles: [{
        id: "human-7",
        frameId: "   ",
        position: { x: 1.8, y: 2.2, z: 0 },
        radiusMeters: 0.35,
        observedAt,
        uncertainty: 0.08,
      }],
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects an obstacle identity that is only whitespace", () => {
    const captured = createROS2WorldSnapshot(state({
      obstacles: [{
        id: "   ",
        position: { x: 1.8, y: 2.2, z: 0 },
        radiusMeters: 0.35,
        observedAt,
        uncertainty: 0.08,
      }],
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects an obstacle identity with leading or trailing whitespace", () => {
    const captured = createROS2WorldSnapshot(state({
      obstacles: [{
        id: " human-7",
        position: { x: 1.8, y: 2.2, z: 0 },
        radiusMeters: 0.35,
        observedAt,
        uncertainty: 0.08,
      }],
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects obstacle ids that collide after trimming", () => {
    const captured = createROS2WorldSnapshot(state({
      obstacles: [
        {
          id: "human-7",
          position: { x: 1.8, y: 2.2, z: 0 },
          radiusMeters: 0.35,
          observedAt,
          uncertainty: 0.08,
        },
        {
          id: " human-7",
          position: { x: 3.1, y: 0.4, z: 0 },
          radiusMeters: 0.2,
          observedAt,
          uncertainty: 0.08,
        },
      ],
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a map frame that is only whitespace", () => {
    const captured = createROS2WorldSnapshot(state({
      frameId: "   ",
      map: {
        digest: "a".repeat(64),
        frameId: "   ",
        observedAt,
        uncertainty: 0.01,
      },
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a map digest that is not lowercase hex", () => {
    const captured = createROS2WorldSnapshot(state({
      map: {
        digest: "A".repeat(64),
        frameId: "map",
        observedAt,
        uncertainty: 0.01,
      },
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a map digest that is missing", () => {
    const captured = createROS2WorldSnapshot(state({
      map: {
        digest: undefined as unknown as string,
        frameId: "map",
        observedAt,
        uncertainty: 0.01,
      },
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a transform parent frame that is only whitespace", () => {
    const base = state();
    const captured = createROS2WorldSnapshot(state({
      transforms: [{
        ...base.transforms![0]!,
        parentFrame: "   ",
      }],
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a transform parent frame with leading or trailing whitespace", () => {
    const base = state();
    const captured = createROS2WorldSnapshot(state({
      transforms: [{
        ...base.transforms![0]!,
        parentFrame: " map",
      }],
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a transform child frame that is only whitespace", () => {
    const base = state();
    const captured = createROS2WorldSnapshot(state({
      transforms: [{
        ...base.transforms![0]!,
        childFrame: "   ",
      }],
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a transform child frame with leading or trailing whitespace", () => {
    const base = state();
    const captured = createROS2WorldSnapshot(state({
      transforms: [{
        ...base.transforms![0]!,
        childFrame: " base_link",
      }],
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects transform child frames that collide after trimming", () => {
    const base = state();
    const captured = createROS2WorldSnapshot(state({
      transforms: [
        base.transforms![0]!,
        {
          ...base.transforms![0]!,
          parentFrame: "odom",
          childFrame: " base_link",
        },
      ],
    }), { now: () => now });

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

  it("rejects a joint name that is only whitespace", () => {
    const captured = createROS2WorldSnapshot(state({
      jointState: {
        observedAt,
        value: { name: ["   "], position: [1.2], velocity: [0.1], effort: [] },
      },
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects a joint name with leading or trailing whitespace", () => {
    const captured = createROS2WorldSnapshot(state({
      jointState: {
        observedAt,
        value: { name: [" elbow"], position: [1.2], velocity: [0.1], effort: [] },
      },
    }), { now: () => now });

    expect(captured.ok ? undefined : captured.error.code).toBe("INVALID_WORLD_STATE");
  });

  it("rejects joint names that collide after trimming", () => {
    const captured = createROS2WorldSnapshot(state({
      jointState: {
        observedAt,
        value: { name: ["elbow", " elbow"], position: [1.2, 0.4], velocity: [], effort: [] },
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
