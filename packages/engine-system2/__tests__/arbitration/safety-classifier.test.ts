import { describe, it, expect } from "vitest";
import { classifyActionSafety } from "../../src/arbitration/safety-classifier.js";
import type { SintActionRecommendation } from "@sint/core";

function makeRec(overrides: Partial<SintActionRecommendation> = {}): SintActionRecommendation {
  return {
    action: "publish",
    resource: "ros2:///camera/image",
    params: {},
    confidence: 0.9,
    isSafetyRelevant: false,
    ...overrides,
  };
}

describe("classifyActionSafety", () => {
  it("cmd_vel resource → safety-relevant", () => {
    const result = classifyActionSafety(
      makeRec({ resource: "ros2:///cmd_vel" }),
    );
    expect(result.isSafe).toBe(false);
    expect(result.reason).toContain("cmd_vel");
  });

  it("gripper resource → safety-relevant", () => {
    const result = classifyActionSafety(
      makeRec({ resource: "ros2:///gripper/open" }),
    );
    expect(result.isSafe).toBe(false);
    expect(result.reason).toContain("safety-relevant pattern");
  });

  it("camera resource → not safety-relevant", () => {
    const result = classifyActionSafety(
      makeRec({ resource: "ros2:///camera/image" }),
    );
    expect(result.isSafe).toBe(true);
  });

  it("isSafetyRelevant flag true → safety-relevant", () => {
    const result = classifyActionSafety(
      makeRec({ isSafetyRelevant: true }),
    );
    expect(result.isSafe).toBe(false);
    expect(result.reason).toContain("explicitly marked");
  });

  it("low confidence (< 0.5) → unsafe", () => {
    const result = classifyActionSafety(
      makeRec({ confidence: 0.3 }),
    );
    expect(result.isSafe).toBe(false);
    expect(result.reason).toContain("below minimum threshold");
  });

  it("high confidence + safe resource → safe", () => {
    const result = classifyActionSafety(
      makeRec({
        resource: "ros2:///camera/image",
        confidence: 0.95,
        isSafetyRelevant: false,
      }),
    );
    expect(result.isSafe).toBe(true);
    expect(result.reason).toContain("passes all safety checks");
  });
});
