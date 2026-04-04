import { describe, it, expect } from "vitest";
import { AnomalyDetector } from "../src/anomaly-detector.js";
import type { SintWorldState, SintPerceivedObject, SintPose } from "@sint/core";

const DEFAULT_POSE: SintPose = {
  position: { x: 0, y: 0, z: 0 },
  orientation: { roll: 0, pitch: 0, yaw: 0 },
};

function makeWorldState(
  objects: SintPerceivedObject[],
  pose: SintPose = DEFAULT_POSE,
): SintWorldState {
  return {
    timestamp: "2026-03-17T10:00:00.000000Z",
    objects,
    robotPose: pose,
    anomalyFlags: [],
    humanPresent: objects.some((o) => o.isHuman),
  };
}

function makeObject(
  classLabel: string,
  confidence: number,
  position: { x: number; y: number; z: number } = { x: 5, y: 5, z: 0 },
  isHuman = false,
): SintPerceivedObject {
  return {
    classLabel,
    confidence,
    boundingBox3D: {
      min: { x: position.x - 0.5, y: position.y - 0.5, z: position.z - 0.5 },
      max: { x: position.x + 0.5, y: position.y + 0.5, z: position.z + 0.5 },
    },
    isHuman,
  };
}

describe("AnomalyDetector", () => {
  it("no anomalies for normal world state returns empty array", () => {
    const detector = new AnomalyDetector();
    const ws = makeWorldState([
      makeObject("box", 0.9),
      makeObject("table", 0.85),
    ]);
    const flags = detector.analyze(ws);
    // High confidence, far from robot, no humans — no flags expected
    // (except possibly distribution_shift which needs enough samples)
    const relevant = flags.filter(
      (f) =>
        f.type === "low_confidence" ||
        f.type === "collision_risk",
    );
    expect(relevant.length).toBe(0);
  });

  it("detects low confidence object with low_confidence flag", () => {
    const detector = new AnomalyDetector({ confidenceThreshold: 0.5 });
    const ws = makeWorldState([makeObject("blob", 0.2)]);
    const flags = detector.analyze(ws);
    const lowConf = flags.find((f) => f.type === "low_confidence");
    expect(lowConf).toBeDefined();
    expect(lowConf!.message).toContain("blob");
  });

  it("detects distribution shift after many normal readings", () => {
    const detector = new AnomalyDetector({
      confidenceThreshold: 0.3,
      distributionShiftSigma: 2.0,
      windowSize: 50,
    });

    // Feed many normal-confidence readings to establish baseline
    for (let i = 0; i < 20; i++) {
      const ws = makeWorldState([makeObject("box", 0.9 + Math.random() * 0.05)]);
      detector.analyze(ws);
    }

    // Now feed a very different reading
    const outlier = makeWorldState([makeObject("anomaly", 0.1)]);
    const flags = detector.analyze(outlier);
    const shift = flags.find((f) => f.type === "distribution_shift");
    expect(shift).toBeDefined();
    expect(shift!.message).toContain("sigma");
  });

  it("detects collision risk when object is near robot", () => {
    const detector = new AnomalyDetector();
    // Object centered at (0.2, 0, 0.5) — very close to robot at (0,0,0)
    const nearObject = makeObject("obstacle", 0.9, { x: 0.2, y: 0, z: 0 });
    const ws = makeWorldState([nearObject]);
    const flags = detector.analyze(ws);
    const collision = flags.find((f) => f.type === "collision_risk");
    expect(collision).toBeDefined();
    expect(collision!.message).toContain("obstacle");
  });

  it("reset clears running statistics", () => {
    const detector = new AnomalyDetector({
      distributionShiftSigma: 2.0,
    });

    // Build up statistics with high confidence
    for (let i = 0; i < 20; i++) {
      detector.analyze(makeWorldState([makeObject("box", 0.95)]));
    }

    // Reset statistics
    detector.reset();

    // After reset, a low confidence reading should NOT trigger distribution_shift
    // because there's not enough history
    const ws = makeWorldState([makeObject("box", 0.1)]);
    const flags = detector.analyze(ws);
    const shift = flags.find((f) => f.type === "distribution_shift");
    expect(shift).toBeUndefined();
  });

  it("severity scales with distance for collision risk", () => {
    const detector = new AnomalyDetector();

    // Very close object — high severity
    const veryClose = makeObject("wall", 0.9, { x: 0.05, y: 0, z: 0 });
    const flags1 = detector.analyze(makeWorldState([veryClose]));
    const collision1 = flags1.find((f) => f.type === "collision_risk");

    detector.reset();

    // Slightly farther but still within threshold — lower severity
    const closerToEdge = makeObject("wall", 0.9, { x: 0.4, y: 0, z: 0 });
    const flags2 = detector.analyze(makeWorldState([closerToEdge]));
    const collision2 = flags2.find((f) => f.type === "collision_risk");

    expect(collision1).toBeDefined();
    expect(collision2).toBeDefined();
    expect(collision1!.severity).toBeGreaterThan(collision2!.severity);
  });

  it("multiple anomaly types can fire simultaneously", () => {
    const detector = new AnomalyDetector({ confidenceThreshold: 0.5 });

    // Object that is low confidence AND near robot AND human
    const dangerObject: SintPerceivedObject = {
      classLabel: "person",
      confidence: 0.2,
      boundingBox3D: {
        min: { x: -0.1, y: -0.1, z: -0.1 },
        max: { x: 0.1, y: 0.1, z: 0.1 },
      },
      isHuman: true,
    };
    const ws = makeWorldState([dangerObject]);
    const flags = detector.analyze(ws);

    const types = new Set(flags.map((f) => f.type));
    expect(types.has("low_confidence")).toBe(true);
    expect(types.has("collision_risk")).toBe(true);
    // Human detection results in "novelty" type
    expect(types.has("novelty")).toBe(true);
  });

  it("respects custom config thresholds", () => {
    // With a very high confidence threshold, even 0.8 is "low"
    const detector = new AnomalyDetector({ confidenceThreshold: 0.95 });
    const ws = makeWorldState([makeObject("box", 0.8)]);
    const flags = detector.analyze(ws);
    const lowConf = flags.find((f) => f.type === "low_confidence");
    expect(lowConf).toBeDefined();

    // With a very low threshold, 0.8 is fine
    const detector2 = new AnomalyDetector({ confidenceThreshold: 0.1 });
    const flags2 = detector2.analyze(ws);
    const lowConf2 = flags2.find((f) => f.type === "low_confidence");
    expect(lowConf2).toBeUndefined();
  });
});
