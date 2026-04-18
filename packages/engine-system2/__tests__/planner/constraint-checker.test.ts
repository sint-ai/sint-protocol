import { describe, it, expect } from "vitest";
import { PlanConstraintChecker } from "../../src/planner/constraint-checker.js";
import { ApprovalTier } from "@sint-ai/core";
import type { SintPlan } from "@sint-ai/core";

function makePlan(stepParams: Record<string, unknown>[] = [{}]): SintPlan {
  return {
    planId: "test-plan",
    goalId: "test-goal",
    steps: stepParams.map((params, i) => ({
      action: `step${i}`,
      resource: "ros2:///cmd_vel",
      params,
      requiredTier: ApprovalTier.T2_ACT,
      preconditions: ["ready"],
    })),
    estimatedDurationMs: 5000,
    status: "pending",
    createdAt: "2026-03-17T10:00:00.000000Z",
  };
}

describe("PlanConstraintChecker", () => {
  it("valid plan passes constraints → ok", () => {
    const checker = new PlanConstraintChecker();
    const plan = makePlan([{ forceNewtons: 10, velocityMps: 0.5 }]);
    const result = checker.checkPlanConstraints(plan, {
      maxForceNewtons: 50,
      maxVelocityMps: 1.0,
    });
    expect(result.ok).toBe(true);
  });

  it("step exceeding force limit → error", () => {
    const checker = new PlanConstraintChecker();
    const plan = makePlan([{ forceNewtons: 100 }]);
    const result = checker.checkPlanConstraints(plan, {
      maxForceNewtons: 50,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("force constraint");
      expect(result.error.message).toContain("100");
    }
  });

  it("step exceeding velocity → error", () => {
    const checker = new PlanConstraintChecker();
    const plan = makePlan([{ velocityMps: 2.0 }]);
    const result = checker.checkPlanConstraints(plan, {
      maxVelocityMps: 1.0,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("velocity constraint");
      expect(result.error.message).toContain("2");
    }
  });

  it("step outside geofence → error", () => {
    const checker = new PlanConstraintChecker();
    const plan = makePlan([{ targetX: 100, targetY: 100 }]);
    const result = checker.checkPlanConstraints(plan, {
      geofence: {
        coordinates: [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ],
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("geofence constraint");
    }
  });

  it("plan with no constraints passes", () => {
    const checker = new PlanConstraintChecker();
    const plan = makePlan([{ forceNewtons: 999, velocityMps: 999 }]);
    const result = checker.checkPlanConstraints(plan, {});
    expect(result.ok).toBe(true);
  });

  it("error identifies which step violated", () => {
    const checker = new PlanConstraintChecker();
    const plan = makePlan([
      { forceNewtons: 10 },
      { forceNewtons: 200 },
    ]);
    const result = checker.checkPlanConstraints(plan, {
      maxForceNewtons: 50,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("Step 1");
    }
  });
});
