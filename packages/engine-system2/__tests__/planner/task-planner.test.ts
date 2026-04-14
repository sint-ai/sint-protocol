import { describe, it, expect, vi } from "vitest";
import { TaskPlanner } from "../../src/planner/task-planner.js";
import type { SintWorldState } from "@pshkv/core";

function makeWorldState(): SintWorldState {
  return {
    timestamp: "2026-03-17T10:00:00.000000Z",
    objects: [],
    robotPose: {
      position: { x: 0, y: 0, z: 0 },
      orientation: { roll: 0, pitch: 0, yaw: 0 },
    },
    anomalyFlags: [],
    humanPresent: false,
  };
}

describe("TaskPlanner", () => {
  it("creates plan from goal → ok", () => {
    const planner = new TaskPlanner();
    const result = planner.createPlan(
      "navigate to waypoint A",
      makeWorldState(),
      ["navigate", "scan"],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.steps.length).toBe(2);
    }
  });

  it("plan has valid planId", () => {
    const planner = new TaskPlanner();
    const result = planner.createPlan(
      "pick up object",
      makeWorldState(),
      ["navigate"],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(typeof result.value.planId).toBe("string");
      expect(result.value.planId.length).toBeGreaterThan(0);
    }
  });

  it("plan steps have correct structure", () => {
    const planner = new TaskPlanner();
    const result = planner.createPlan(
      "inspect area",
      makeWorldState(),
      ["scan", "report"],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      const step = result.value.steps[0];
      expect(step).toBeDefined();
      expect(step!.action).toBe("scan");
      expect(step!.resource).toBeDefined();
      expect(step!.params).toBeDefined();
      expect(step!.requiredTier).toBeDefined();
      expect(step!.preconditions).toBeDefined();
    }
  });

  it("validates plan against world state → ok", () => {
    const planner = new TaskPlanner();
    const createResult = planner.createPlan(
      "navigate",
      makeWorldState(),
      ["navigate"],
    );
    expect(createResult.ok).toBe(true);
    if (createResult.ok) {
      const validateResult = planner.validatePlan(
        createResult.value,
        makeWorldState(),
      );
      expect(validateResult.ok).toBe(true);
    }
  });

  it("validates plan rejects missing preconditions", () => {
    const planner = new TaskPlanner();
    const plan = {
      planId: "test-plan",
      goalId: "test-goal",
      steps: [
        {
          action: "navigate",
          resource: "ros2:///cmd_vel",
          params: {},
          requiredTier: "T2_act" as const,
          preconditions: [""],
        },
      ],
      estimatedDurationMs: 5000,
      status: "pending" as const,
      createdAt: "2026-03-17T10:00:00.000000Z",
    };
    const result = planner.validatePlan(plan, makeWorldState());
    expect(result.ok).toBe(false);
  });

  it("empty available actions → error", () => {
    const planner = new TaskPlanner();
    const result = planner.createPlan(
      "navigate",
      makeWorldState(),
      [],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("No available actions");
    }
  });

  it("plan status starts as pending", () => {
    const planner = new TaskPlanner();
    const result = planner.createPlan(
      "navigate",
      makeWorldState(),
      ["navigate"],
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("pending");
    }
  });

  it("emits plan.created event", () => {
    const onEvent = vi.fn();
    const planner = new TaskPlanner(onEvent);
    planner.createPlan("navigate", makeWorldState(), ["navigate"]);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "engine.system2.plan.created",
        payload: expect.objectContaining({
          stepCount: 1,
          goal: "navigate",
        }),
      }),
    );
  });
});
