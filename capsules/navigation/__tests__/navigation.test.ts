/**
 * Navigation Capsule — Tests.
 */

import { describe, it, expect, vi } from "vitest";
import { distance2D, computeVelocity, execute } from "../src/index.js";
import type { Waypoint } from "../src/index.js";

function createMockApi() {
  return {
    readSensor: vi.fn(),
    requestAction: vi.fn().mockResolvedValue({ allowed: true }),
    log: vi.fn(),
  };
}

describe("distance2D", () => {
  it("computes correct distance", () => {
    expect(distance2D(0, 0, 3, 4)).toBeCloseTo(5);
  });

  it("returns 0 for same point", () => {
    expect(distance2D(1, 1, 1, 1)).toBe(0);
  });
});

describe("computeVelocity", () => {
  it("returns zero velocity when at waypoint", () => {
    const wp: Waypoint = { x: 1, y: 0, tolerance: 0.5 };
    const cmd = computeVelocity(1, 0, 0, wp);
    expect(cmd.linearX).toBe(0);
    expect(cmd.angularZ).toBe(0);
  });

  it("returns positive linear velocity toward waypoint", () => {
    const wp: Waypoint = { x: 5, y: 0, tolerance: 0.1 };
    const cmd = computeVelocity(0, 0, 0, wp);
    expect(cmd.linearX).toBeGreaterThan(0);
  });

  it("respects max linear speed", () => {
    const wp: Waypoint = { x: 100, y: 0, tolerance: 0.1 };
    const config = { maxLinearSpeed: 0.5, maxAngularSpeed: 0.5, steeringGain: 1.0 };
    const cmd = computeVelocity(0, 0, 0, wp, config);
    expect(cmd.linearX).toBeLessThanOrEqual(0.5);
  });
});

describe("execute", () => {
  it("navigates toward waypoint successfully", async () => {
    const api = createMockApi();
    api.readSensor.mockImplementation(async (id: string) => {
      if (id === "gps") return { data: { x: 0, y: 0 }, confidence: 0.95 };
      if (id === "imu") return { data: { yaw: 0 }, confidence: 0.95 };
      return null;
    });

    const result = await execute(api, [{ x: 5, y: 0, tolerance: 0.2 }]);
    expect(result.status).toBe("navigating");
    expect(result.velocityCommand).not.toBeNull();
    expect(result.distanceToWaypoint).toBeGreaterThan(0);
  });

  it("returns arrived when all waypoints reached", async () => {
    const result = await execute(createMockApi(), [], 0);
    expect(result.status).toBe("arrived");
  });

  it("returns error when no GPS data", async () => {
    const api = createMockApi();
    api.readSensor.mockResolvedValue(null);

    const result = await execute(api, [{ x: 1, y: 0, tolerance: 0.1 }]);
    expect(result.status).toBe("error");
  });

  it("returns blocked when PolicyGateway denies cmd_vel", async () => {
    const api = createMockApi();
    api.readSensor.mockImplementation(async (id: string) => {
      if (id === "gps") return { data: { x: 0, y: 0 }, confidence: 0.95 };
      if (id === "imu") return { data: { yaw: 0 }, confidence: 0.95 };
      return null;
    });
    api.requestAction.mockResolvedValue({ allowed: false, reason: "human detected" });

    const result = await execute(api, [{ x: 5, y: 0, tolerance: 0.2 }]);
    expect(result.status).toBe("blocked");
    expect(result.velocityCommand).toBeNull();
  });

  it("requests action through PolicyGateway for cmd_vel", async () => {
    const api = createMockApi();
    api.readSensor.mockImplementation(async (id: string) => {
      if (id === "gps") return { data: { x: 0, y: 0 }, confidence: 0.95 };
      if (id === "imu") return { data: { yaw: 0 }, confidence: 0.95 };
      return null;
    });

    await execute(api, [{ x: 5, y: 0, tolerance: 0.2 }]);
    expect(api.requestAction).toHaveBeenCalledWith(
      "publish",
      "ros2:///cmd_vel",
      expect.objectContaining({ linearX: expect.any(Number), angularZ: expect.any(Number) }),
    );
  });

  it("detects arrival at waypoint within tolerance", async () => {
    const api = createMockApi();
    api.readSensor.mockImplementation(async (id: string) => {
      if (id === "gps") return { data: { x: 0.99, y: 0 }, confidence: 0.95 };
      if (id === "imu") return { data: { yaw: 0 }, confidence: 0.95 };
      return null;
    });

    const result = await execute(api, [{ x: 1, y: 0, tolerance: 0.2 }]);
    expect(result.distanceToWaypoint).toBe(0);
  });
});
