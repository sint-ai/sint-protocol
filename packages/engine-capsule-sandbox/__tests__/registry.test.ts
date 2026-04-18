/**
 * SINT Protocol — Capsule Registry unit tests.
 *
 * Tests in-memory capsule registration, lookup, listing, and filtering.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { CapsuleRegistry } from "../src/registry.js";
import type { SintCapsuleManifest } from "@sint-ai/core";

const CAPSULE_ID_1 = "01905f7c-0000-7000-8000-000000000001";
const CAPSULE_ID_2 = "01905f7c-0000-7000-8000-000000000002";
const VALID_HASH = "a".repeat(64);

function makeManifest(
  overrides: Partial<SintCapsuleManifest> = {},
): SintCapsuleManifest {
  return {
    capsuleId: CAPSULE_ID_1,
    version: "1.0.0",
    name: "test-capsule",
    author: "sint-labs",
    sensors: ["camera_rgb"],
    actuators: [],
    safetyDeclarations: {},
    resourceLimits: {
      maxMemoryMB: 256,
      maxCpuTimeMs: 5000,
      maxStorageMB: 50,
    },
    runtime: "typescript",
    entryPoint: "src/index.ts",
    contentHash: VALID_HASH,
    ...overrides,
  };
}

describe("CapsuleRegistry", () => {
  let registry: CapsuleRegistry;

  beforeEach(() => {
    registry = new CapsuleRegistry();
  });

  it("register and get capsule", () => {
    const manifest = makeManifest();

    const regResult = registry.register(manifest);
    expect(regResult.ok).toBe(true);

    const getResult = registry.get(CAPSULE_ID_1);
    expect(getResult.ok).toBe(true);
    if (getResult.ok) {
      expect(getResult.value.manifest.name).toBe("test-capsule");
      expect(getResult.value.state).toBe("registered");
      expect(getResult.value.executionCount).toBe(0);
    }
  });

  it("unregister removes capsule and get returns NOT_FOUND", () => {
    const manifest = makeManifest();
    registry.register(manifest);

    const unregResult = registry.unregister(CAPSULE_ID_1);
    expect(unregResult.ok).toBe(true);

    const getResult = registry.get(CAPSULE_ID_1);
    expect(getResult.ok).toBe(false);
    if (!getResult.ok) {
      expect(getResult.error.code).toBe("NOT_FOUND");
    }
  });

  it("list returns all registered capsules", () => {
    const manifest1 = makeManifest({ capsuleId: CAPSULE_ID_1, name: "first" });
    const manifest2 = makeManifest({ capsuleId: CAPSULE_ID_2, name: "second" });

    registry.register(manifest1);
    registry.register(manifest2);

    const all = registry.list();
    expect(all).toHaveLength(2);

    const names = all.map((c) => c.manifest.name);
    expect(names).toContain("first");
    expect(names).toContain("second");
  });

  it("filterBySensor returns matching capsules", () => {
    const cameraCapsule = makeManifest({
      capsuleId: CAPSULE_ID_1,
      name: "camera-capsule",
      sensors: ["camera_rgb", "camera_depth"],
    });
    const lidarCapsule = makeManifest({
      capsuleId: CAPSULE_ID_2,
      name: "lidar-capsule",
      sensors: ["lidar"],
    });

    registry.register(cameraCapsule);
    registry.register(lidarCapsule);

    const cameraResults = registry.filterBySensor("camera_rgb");
    expect(cameraResults).toHaveLength(1);
    expect(cameraResults[0]!.manifest.name).toBe("camera-capsule");

    const lidarResults = registry.filterBySensor("lidar");
    expect(lidarResults).toHaveLength(1);
    expect(lidarResults[0]!.manifest.name).toBe("lidar-capsule");

    const imuResults = registry.filterBySensor("imu");
    expect(imuResults).toHaveLength(0);
  });

  it("register duplicate capsuleId returns ALREADY_REGISTERED", () => {
    const manifest = makeManifest();

    const first = registry.register(manifest);
    expect(first.ok).toBe(true);

    const second = registry.register(manifest);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe("ALREADY_REGISTERED");
      expect(second.error.capsuleId).toBe(CAPSULE_ID_1);
    }
  });

  it("unregister unknown capsuleId returns NOT_FOUND", () => {
    const unknownId = "01905f7c-0000-7000-8000-ffffffffffff";
    const result = registry.unregister(unknownId);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("NOT_FOUND");
      expect(result.error.capsuleId).toBe(unknownId);
    }
  });
});
