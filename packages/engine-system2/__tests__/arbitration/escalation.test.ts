import { describe, it, expect } from "vitest";
import { EscalationManager } from "../../src/arbitration/escalation.js";
import type { SintArbitrationDecision } from "@sint-ai/core";

function makeOverrideDecision(): SintArbitrationDecision {
  return {
    s1Recommendation: {
      action: "move",
      resource: "ros2:///cmd_vel",
      params: {},
      confidence: 0.9,
      isSafetyRelevant: true,
    },
    s2Recommendation: {
      action: "stop",
      resource: "ros2:///cmd_vel",
      params: {},
      confidence: 0.8,
      isSafetyRelevant: true,
    },
    winner: "system2",
    reason: "Safety override",
    isSafetyOverride: true,
    decidedAt: "2026-03-17T10:00:00.000000Z",
  };
}

function makeNonOverrideDecision(): SintArbitrationDecision {
  return {
    s1Recommendation: {
      action: "scan",
      resource: "ros2:///camera/image",
      params: {},
      confidence: 0.9,
      isSafetyRelevant: false,
    },
    s2Recommendation: {
      action: "scan",
      resource: "ros2:///camera/image",
      params: {},
      confidence: 0.8,
      isSafetyRelevant: false,
    },
    winner: "system1",
    reason: "Agreement",
    isSafetyOverride: false,
    decidedAt: "2026-03-17T10:00:00.000000Z",
  };
}

describe("EscalationManager", () => {
  it("initial state → shouldEscalateToHuman false", () => {
    const manager = new EscalationManager();
    expect(manager.shouldEscalateToHuman()).toBe(false);
  });

  it("3 overrides within 60s → shouldEscalateToHuman true", () => {
    const manager = new EscalationManager();
    manager.recordDisagreement(makeOverrideDecision());
    manager.recordDisagreement(makeOverrideDecision());
    manager.recordDisagreement(makeOverrideDecision());
    expect(manager.shouldEscalateToHuman()).toBe(true);
  });

  it("overrides outside window → no escalation", () => {
    const manager = new EscalationManager();
    // Non-override decisions should not count
    manager.recordDisagreement(makeNonOverrideDecision());
    manager.recordDisagreement(makeNonOverrideDecision());
    manager.recordDisagreement(makeNonOverrideDecision());
    expect(manager.shouldEscalateToHuman()).toBe(false);
  });

  it("reset clears disagreement count", () => {
    const manager = new EscalationManager();
    manager.recordDisagreement(makeOverrideDecision());
    manager.recordDisagreement(makeOverrideDecision());
    manager.recordDisagreement(makeOverrideDecision());
    expect(manager.shouldEscalateToHuman()).toBe(true);
    manager.reset();
    expect(manager.shouldEscalateToHuman()).toBe(false);
  });

  it("getDisagreementCount returns correct count", () => {
    const manager = new EscalationManager();
    expect(manager.getDisagreementCount()).toBe(0);
    manager.recordDisagreement(makeOverrideDecision());
    expect(manager.getDisagreementCount()).toBe(1);
    manager.recordDisagreement(makeOverrideDecision());
    expect(manager.getDisagreementCount()).toBe(2);
  });
});
