/**
 * SINT Protocol — Capsule API unit tests.
 *
 * Tests the restricted API surface factory function.
 */

import { describe, it, expect, vi } from "vitest";
import { createCapsuleImports } from "../src/capsule-api.js";
import type { SintCapsuleManifest, SintSensorReading } from "@sint-ai/core";

const CAPSULE_ID = "01905f7c-0000-7000-8000-000000000001";
const VALID_HASH = "a".repeat(64);

function makeManifest(
  sensors: SintCapsuleManifest["sensors"] = ["camera_rgb"],
): SintCapsuleManifest {
  return {
    capsuleId: CAPSULE_ID,
    version: "1.0.0",
    name: "test-capsule",
    author: "sint-labs",
    sensors,
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
  };
}

function makeSensorReading(
  modality: SintSensorReading["modality"],
): SintSensorReading {
  return {
    sensorId: `sensor_${modality}`,
    modality,
    timestamp: "2026-03-17T10:00:00.000000Z",
    data: new Float32Array([1.0, 2.0, 3.0]),
    confidence: 0.95,
  };
}

describe("createCapsuleImports", () => {
  it("readSensor allows declared sensor", async () => {
    const reading = makeSensorReading("camera_rgb");
    const sensorProvider = vi.fn().mockResolvedValue(reading);
    const actionGateway = vi.fn();

    const api = createCapsuleImports(
      makeManifest(["camera_rgb"]),
      sensorProvider,
      actionGateway,
    );

    const result = await api.readSensor("cam_front");

    expect(result).toEqual(reading);
    expect(sensorProvider).toHaveBeenCalledWith("cam_front");
  });

  it("readSensor blocks undeclared sensor", async () => {
    // Manifest only declares camera_rgb, but sensor returns lidar data
    const lidarReading = makeSensorReading("lidar");
    const sensorProvider = vi.fn().mockResolvedValue(lidarReading);
    const actionGateway = vi.fn();

    const api = createCapsuleImports(
      makeManifest(["camera_rgb"]),
      sensorProvider,
      actionGateway,
    );

    const result = await api.readSensor("lidar_front");

    expect(result).toBeNull();
  });

  it("requestAction routes through actionGateway", async () => {
    const sensorProvider = vi.fn();
    const actionGateway = vi.fn().mockResolvedValue({
      allowed: true,
      reason: "Policy allows this action",
    });

    const api = createCapsuleImports(
      makeManifest(),
      sensorProvider,
      actionGateway,
    );

    const result = await api.requestAction("navigate", "ros2:///cmd_vel", {
      speed: 0.5,
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe("Policy allows this action");
    expect(actionGateway).toHaveBeenCalledOnce();
  });

  it("requestAction passes params correctly", async () => {
    const sensorProvider = vi.fn();
    const actionGateway = vi.fn().mockResolvedValue({ allowed: false });

    const api = createCapsuleImports(
      makeManifest(),
      sensorProvider,
      actionGateway,
    );

    const params = { x: 1.0, y: 2.0, force: 10 };
    await api.requestAction("move", "ros2:///gripper", params);

    expect(actionGateway).toHaveBeenCalledWith(
      "move",
      "ros2:///gripper",
      params,
    );
  });

  it("log prefixes with capsule ID", () => {
    const sensorProvider = vi.fn();
    const actionGateway = vi.fn();
    const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});

    const api = createCapsuleImports(
      makeManifest(),
      sensorProvider,
      actionGateway,
    );

    api.log("info", "Capsule started successfully");

    expect(consoleSpy).toHaveBeenCalledWith(
      `[capsule:${CAPSULE_ID}]`,
      "Capsule started successfully",
    );

    consoleSpy.mockRestore();
  });

  it("log filters potential secrets from messages", () => {
    const sensorProvider = vi.fn();
    const actionGateway = vi.fn();
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const api = createCapsuleImports(
      makeManifest(),
      sensorProvider,
      actionGateway,
    );

    api.log("warn", "Using api_key=sk-12345-secret-key for auth");

    expect(consoleSpy).toHaveBeenCalledOnce();
    const loggedMessage = consoleSpy.mock.calls[0]![1] as string;
    expect(loggedMessage).toContain("[REDACTED]");
    expect(loggedMessage).not.toContain("sk-12345-secret-key");

    consoleSpy.mockRestore();
  });
});
