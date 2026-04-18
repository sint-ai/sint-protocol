import { describe, it, expect, vi } from "vitest";
import { PlanExecutor } from "../../src/planner/plan-executor.js";
import { ApprovalTier, ok, err } from "@sint-ai/core";
import type { SintPlan, SintPlanStep } from "@sint-ai/core";

function makePlan(stepCount: number): SintPlan {
  const steps: SintPlanStep[] = [];
  for (let i = 0; i < stepCount; i++) {
    steps.push({
      action: `action${i}`,
      resource: `ros2:///resource${i}`,
      params: { index: i },
      requiredTier: ApprovalTier.T1_PREPARE,
      preconditions: ["ready"],
    });
  }
  return {
    planId: "test-plan",
    goalId: "test-goal",
    steps,
    estimatedDurationMs: stepCount * 1000,
    status: "approved",
    createdAt: "2026-03-17T10:00:00.000000Z",
  };
}

describe("PlanExecutor", () => {
  it("executes all steps → ok", async () => {
    const onAction = vi.fn().mockResolvedValue(ok(undefined));
    const executor = new PlanExecutor(onAction);
    const result = await executor.execute(makePlan(3));
    expect(result.ok).toBe(true);
    expect(onAction).toHaveBeenCalledTimes(3);
  });

  it("stops on step failure → error", async () => {
    const onAction = vi
      .fn()
      .mockResolvedValueOnce(ok(undefined))
      .mockResolvedValueOnce(err(new Error("step failed")))
      .mockResolvedValueOnce(ok(undefined));
    const executor = new PlanExecutor(onAction);
    const result = await executor.execute(makePlan(3));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toContain("step failed");
    }
    // Third step should NOT be called
    expect(onAction).toHaveBeenCalledTimes(2);
  });

  it("emits step.executed event for each step", async () => {
    const onAction = vi.fn().mockResolvedValue(ok(undefined));
    const onEvent = vi.fn();
    const executor = new PlanExecutor(onAction, onEvent);
    await executor.execute(makePlan(2));

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "engine.system2.plan.step.executed",
        payload: expect.objectContaining({
          stepIndex: 0,
          success: true,
        }),
      }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "engine.system2.plan.step.executed",
        payload: expect.objectContaining({
          stepIndex: 1,
          success: true,
        }),
      }),
    );
  });

  it("calls onAction for each step", async () => {
    const onAction = vi.fn().mockResolvedValue(ok(undefined));
    const executor = new PlanExecutor(onAction);
    const plan = makePlan(2);
    await executor.execute(plan);

    expect(onAction).toHaveBeenCalledWith(plan.steps[0]);
    expect(onAction).toHaveBeenCalledWith(plan.steps[1]);
  });

  it("handles empty plan → ok", async () => {
    const onAction = vi.fn().mockResolvedValue(ok(undefined));
    const executor = new PlanExecutor(onAction);
    const result = await executor.execute(makePlan(0));
    expect(result.ok).toBe(true);
    expect(onAction).not.toHaveBeenCalled();
  });

  it("tracks step index correctly", async () => {
    const onAction = vi.fn().mockResolvedValue(ok(undefined));
    const onEvent = vi.fn();
    const executor = new PlanExecutor(onAction, onEvent);
    await executor.execute(makePlan(3));

    const indices = onEvent.mock.calls.map(
      (call: [{ payload: { stepIndex: number } }]) => call[0].payload.stepIndex,
    );
    expect(indices).toEqual([0, 1, 2]);
  });

  it("passes step params to onAction", async () => {
    const onAction = vi.fn().mockResolvedValue(ok(undefined));
    const executor = new PlanExecutor(onAction);
    const plan = makePlan(1);
    await executor.execute(plan);

    const calledStep = onAction.mock.calls[0]![0] as SintPlanStep;
    expect(calledStep.params).toEqual({ index: 0 });
  });

  it("aborts remaining steps after failure", async () => {
    const executedSteps: number[] = [];
    const onAction = vi.fn().mockImplementation(async (step: SintPlanStep) => {
      const idx = step.params["index"] as number;
      executedSteps.push(idx);
      if (idx === 1) {
        return err(new Error("fail at step 1"));
      }
      return ok(undefined);
    });
    const executor = new PlanExecutor(onAction);
    await executor.execute(makePlan(4));

    // Only steps 0 and 1 should have been attempted
    expect(executedSteps).toEqual([0, 1]);
  });
});
