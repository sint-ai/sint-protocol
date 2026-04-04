import { describe, it, expect, vi } from "vitest";
import { Arbitrator } from "../../src/arbitration/arbitrator.js";
import type { SintActionRecommendation, SintWorldState } from "@sint/core";

function makeRec(overrides: Partial<SintActionRecommendation> = {}): SintActionRecommendation {
  return {
    action: "publish",
    resource: "ros2:///camera/image",
    params: {},
    confidence: 0.8,
    isSafetyRelevant: false,
    ...overrides,
  };
}

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

describe("Arbitrator", () => {
  it("both agree, safety-relevant → System 2 wins", () => {
    const arb = new Arbitrator();
    const s1 = makeRec({ action: "stop", resource: "ros2:///cmd_vel", isSafetyRelevant: true, confidence: 0.9 });
    const s2 = makeRec({ action: "stop", resource: "ros2:///cmd_vel", isSafetyRelevant: true, confidence: 0.7 });
    const decision = arb.arbitrate(s1, s2, makeWorldState());
    expect(decision.winner).toBe("system2");
    expect(decision.isSafetyOverride).toBe(false);
  });

  it("both agree, not safety-relevant, System 1 higher confidence → System 1 wins", () => {
    const arb = new Arbitrator();
    const s1 = makeRec({ action: "scan", resource: "ros2:///camera/image", confidence: 0.95 });
    const s2 = makeRec({ action: "scan", resource: "ros2:///camera/image", confidence: 0.7 });
    const decision = arb.arbitrate(s1, s2, makeWorldState());
    expect(decision.winner).toBe("system1");
  });

  it("disagree, safety-relevant → System 2 ALWAYS wins (THE INVARIANT)", () => {
    const arb = new Arbitrator();
    const s1 = makeRec({
      action: "move-fast",
      resource: "ros2:///cmd_vel",
      isSafetyRelevant: true,
      confidence: 0.99,
    });
    const s2 = makeRec({
      action: "stop",
      resource: "ros2:///cmd_vel",
      isSafetyRelevant: true,
      confidence: 0.6,
    });
    const decision = arb.arbitrate(s1, s2, makeWorldState());

    // THE CRITICAL INVARIANT: System 2 ALWAYS wins on safety disagreement
    expect(decision.winner).toBe("system2");
    expect(decision.isSafetyOverride).toBe(true);
  });

  it("disagree, not safety-relevant → higher confidence wins", () => {
    const arb = new Arbitrator();
    const s1 = makeRec({ action: "scan-left", resource: "ros2:///camera/pan", confidence: 0.6 });
    const s2 = makeRec({ action: "scan-right", resource: "ros2:///camera/pan", confidence: 0.9 });
    const decision = arb.arbitrate(s1, s2, makeWorldState());
    expect(decision.winner).toBe("system2");
    expect(decision.isSafetyOverride).toBe(false);
  });

  it("S1 safety-relevant, S2 not → System 2 wins on safety", () => {
    const arb = new Arbitrator();
    const s1 = makeRec({
      action: "move",
      resource: "ros2:///cmd_vel",
      isSafetyRelevant: true,
      confidence: 0.95,
    });
    const s2 = makeRec({
      action: "wait",
      resource: "ros2:///status",
      isSafetyRelevant: false,
      confidence: 0.5,
    });
    const decision = arb.arbitrate(s1, s2, makeWorldState());
    expect(decision.winner).toBe("system2");
    expect(decision.isSafetyOverride).toBe(true);
  });

  it("S2 safety-relevant, S1 not → System 2 wins on safety", () => {
    const arb = new Arbitrator();
    const s1 = makeRec({
      action: "scan",
      resource: "ros2:///camera/image",
      isSafetyRelevant: false,
      confidence: 0.95,
    });
    const s2 = makeRec({
      action: "emergency-stop",
      resource: "ros2:///cmd_vel",
      isSafetyRelevant: true,
      confidence: 0.5,
    });
    const decision = arb.arbitrate(s1, s2, makeWorldState());
    expect(decision.winner).toBe("system2");
    expect(decision.isSafetyOverride).toBe(true);
  });

  it("isSafetyOverride is true when S2 overrides S1", () => {
    const arb = new Arbitrator();
    const s1 = makeRec({
      action: "accelerate",
      resource: "ros2:///cmd_vel",
      isSafetyRelevant: true,
      confidence: 0.95,
    });
    const s2 = makeRec({
      action: "brake",
      resource: "ros2:///cmd_vel",
      isSafetyRelevant: true,
      confidence: 0.8,
    });
    const decision = arb.arbitrate(s1, s2, makeWorldState());
    expect(decision.isSafetyOverride).toBe(true);
    expect(decision.winner).toBe("system2");
  });

  it("isSafetyOverride is false when they agree", () => {
    const arb = new Arbitrator();
    const s1 = makeRec({ action: "scan", resource: "ros2:///camera/image", confidence: 0.9 });
    const s2 = makeRec({ action: "scan", resource: "ros2:///camera/image", confidence: 0.8 });
    const decision = arb.arbitrate(s1, s2, makeWorldState());
    expect(decision.isSafetyOverride).toBe(false);
  });

  it("emits arbitration.decided event", () => {
    const onEvent = vi.fn();
    const arb = new Arbitrator(onEvent);
    const s1 = makeRec({ action: "scan", resource: "ros2:///camera/image", confidence: 0.9 });
    const s2 = makeRec({ action: "scan", resource: "ros2:///camera/image", confidence: 0.8 });
    arb.arbitrate(s1, s2, makeWorldState());

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "engine.arbitration.decided",
      }),
    );
  });

  it("emits arbitration.override event on safety override", () => {
    const onEvent = vi.fn();
    const arb = new Arbitrator(onEvent);
    const s1 = makeRec({
      action: "move",
      resource: "ros2:///cmd_vel",
      isSafetyRelevant: true,
      confidence: 0.99,
    });
    const s2 = makeRec({
      action: "stop",
      resource: "ros2:///cmd_vel",
      isSafetyRelevant: true,
      confidence: 0.6,
    });
    arb.arbitrate(s1, s2, makeWorldState());

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "engine.arbitration.override",
      }),
    );
  });
});
