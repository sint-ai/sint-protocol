import { describe, it, expect, beforeEach } from "vitest";
import {
  SystemStateTracker,
  evaluateCrossSystemPolicies,
  DEFAULT_PHYSICAL_POLICIES,
} from "../src/cross-system.js";

describe("SystemStateTracker", () => {
  let tracker: SystemStateTracker;

  beforeEach(() => {
    tracker = new SystemStateTracker();
  });

  it("tracks active states", () => {
    expect(tracker.isActive("robot.moving")).toBe(false);
    tracker.activate("robot.moving");
    expect(tracker.isActive("robot.moving")).toBe(true);
    tracker.deactivate("robot.moving");
    expect(tracker.isActive("robot.moving")).toBe(false);
  });

  it("returns all active states", () => {
    tracker.activate("robot.moving");
    tracker.activate("cmd_vel");
    expect(tracker.getActive().size).toBe(2);
    expect(tracker.getActive().has("robot.moving")).toBe(true);
    expect(tracker.getActive().has("cmd_vel")).toBe(true);
  });

  it("clears all states", () => {
    tracker.activate("a");
    tracker.activate("b");
    tracker.clear();
    expect(tracker.getActive().size).toBe(0);
  });
});

describe("evaluateCrossSystemPolicies", () => {
  let tracker: SystemStateTracker;

  beforeEach(() => {
    tracker = new SystemStateTracker();
  });

  it("returns null when no policies match", () => {
    const result = evaluateCrossSystemPolicies(
      "fs",
      "write",
      DEFAULT_PHYSICAL_POLICIES,
      tracker,
      "T1",
    );
    expect(result).toBeNull();
  });

  it("denies fs.write when robot is moving", () => {
    tracker.activate("robot.moving");

    const result = evaluateCrossSystemPolicies(
      "fs",
      "write",
      DEFAULT_PHYSICAL_POLICIES,
      tracker,
      "T1",
    );

    expect(result).not.toBeNull();
    expect(result!.allowed).toBe(false);
    expect(result!.outcome).toBe("deny");
    expect(result!.reason).toContain("robot is in motion");
  });

  it("denies system.exec when robot is moving", () => {
    tracker.activate("robot.moving");

    const result = evaluateCrossSystemPolicies(
      "system",
      "exec",
      DEFAULT_PHYSICAL_POLICIES,
      tracker,
      "T3",
    );

    expect(result).not.toBeNull();
    expect(result!.allowed).toBe(false);
    expect(result!.reason).toContain("control interference");
  });

  it("denies deploy when cmd_vel active", () => {
    tracker.activate("cmd_vel");

    const result = evaluateCrossSystemPolicies(
      "deploy",
      "production",
      DEFAULT_PHYSICAL_POLICIES,
      tracker,
      "T2",
    );

    expect(result).not.toBeNull();
    expect(result!.allowed).toBe(false);
    expect(result!.reason).toContain("velocity commands are active");
  });

  it("denies network access when drone is armed", () => {
    tracker.activate("drone.armed");

    const result = evaluateCrossSystemPolicies(
      "network",
      "fetch",
      DEFAULT_PHYSICAL_POLICIES,
      tracker,
      "T2",
    );

    expect(result).not.toBeNull();
    expect(result!.allowed).toBe(false);
    expect(result!.reason).toContain("drone is armed");
  });

  it("allows when condition is not active", () => {
    // cmd_vel NOT active
    const result = evaluateCrossSystemPolicies(
      "deploy",
      "production",
      DEFAULT_PHYSICAL_POLICIES,
      tracker,
      "T2",
    );

    expect(result).toBeNull();
  });

  it("supports custom policies", () => {
    tracker.activate("patient.connected");

    const result = evaluateCrossSystemPolicies(
      "system",
      "reboot",
      [
        {
          name: "no-reboot-during-surgery",
          whenActive: "patient.connected",
          denyActions: ["system:reboot*"],
          reason: "Cannot reboot during active patient monitoring",
        },
      ],
      tracker,
      "T3",
    );

    expect(result).not.toBeNull();
    expect(result!.reason).toContain("patient monitoring");
  });

  it("supports wildcard deny patterns", () => {
    tracker.activate("robot.moving");

    const result = evaluateCrossSystemPolicies(
      "anything",
      "at-all",
      [
        {
          name: "lockdown",
          whenActive: "robot.moving",
          denyActions: ["*"],
          reason: "Full lockdown during movement",
        },
      ],
      tracker,
      "T3",
    );

    expect(result).not.toBeNull();
    expect(result!.outcome).toBe("deny");
  });
});
