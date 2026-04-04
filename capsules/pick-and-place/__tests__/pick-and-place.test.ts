/**
 * Pick-and-Place Capsule — Tests.
 */

import { describe, it, expect, vi } from "vitest";
import { detectGraspTargets, parseGripState, execute } from "../src/index.js";

function createMockApi() {
  return {
    readSensor: vi.fn(),
    requestAction: vi.fn().mockResolvedValue({ allowed: true }),
    log: vi.fn(),
  };
}

describe("detectGraspTargets", () => {
  it("returns targets for high confidence reading", () => {
    const targets = detectGraspTargets({}, 0.95);
    expect(targets.length).toBeGreaterThan(0);
    expect(targets[0]!.confidence).toBe(0.95);
  });

  it("returns empty for low confidence reading", () => {
    const targets = detectGraspTargets({}, 0.3);
    expect(targets).toEqual([]);
  });
});

describe("parseGripState", () => {
  it("detects object when force > 1N", () => {
    const state = parseGripState({ force: 15 });
    expect(state.objectDetected).toBe(true);
    expect(state.forceExceeded).toBe(false);
  });

  it("detects force exceeded", () => {
    const state = parseGripState({ force: 60 }, 50);
    expect(state.forceExceeded).toBe(true);
  });

  it("handles missing force data", () => {
    const state = parseGripState({});
    expect(state.forceNewtons).toBe(0);
    expect(state.objectDetected).toBe(false);
  });
});

describe("execute", () => {
  it("detect phase finds objects with high confidence camera", async () => {
    const api = createMockApi();
    api.readSensor.mockResolvedValue({ data: {}, confidence: 0.95 });

    const result = await execute(api, "detect");
    expect(result.phase).toBe("detect");
    expect(result.success).toBe(true);
    expect(result.target).not.toBeNull();
  });

  it("detect phase returns no targets for low confidence", async () => {
    const api = createMockApi();
    api.readSensor.mockResolvedValue({ data: {}, confidence: 0.3 });

    const result = await execute(api, "detect");
    expect(result.success).toBe(false);
    expect(result.target).toBeNull();
  });

  it("grasp phase opens then closes gripper via PolicyGateway", async () => {
    const api = createMockApi();
    api.readSensor.mockResolvedValue({ data: { force: 15 }, confidence: 0.95 });

    const result = await execute(api, "grasp");
    expect(api.requestAction).toHaveBeenCalledWith("call", "ros2:///gripper/open", {});
    expect(api.requestAction).toHaveBeenCalledWith("call", "ros2:///gripper/close", expect.any(Object));
    expect(result.phase).toBe("grasp");
  });

  it("grasp phase detects force exceeded and releases", async () => {
    const api = createMockApi();
    api.readSensor.mockResolvedValue({ data: { force: 60 }, confidence: 0.95 });

    const result = await execute(api, "grasp");
    expect(result.success).toBe(false);
    expect(result.message).toContain("Force limit exceeded");
    // Should have called open again to release
    expect(api.requestAction).toHaveBeenCalledTimes(3); // open + close + emergency open
  });

  it("release phase opens gripper", async () => {
    const api = createMockApi();
    const result = await execute(api, "release");
    expect(result.success).toBe(true);
    expect(api.requestAction).toHaveBeenCalledWith("call", "ros2:///gripper/open", {});
  });

  it("returns error when gripper action is denied", async () => {
    const api = createMockApi();
    api.requestAction.mockResolvedValue({ allowed: false, reason: "safety constraint" });

    const result = await execute(api, "grasp");
    expect(result.phase).toBe("error");
    expect(result.success).toBe(false);
  });

  it("detect phase handles missing camera data", async () => {
    const api = createMockApi();
    api.readSensor.mockResolvedValue(null);

    const result = await execute(api, "detect");
    expect(result.phase).toBe("error");
    expect(result.message).toContain("No camera data");
  });
});
