import { describe, it, expect, vi } from "vitest";
import { ActionPredictor } from "../src/action-predictor.js";
import type { SintWorldState, SintPerceivedObject, SintPose, SintAnomalyFlag } from "@sint/core";

const DEFAULT_POSE: SintPose = {
  position: { x: 0, y: 0, z: 0 },
  orientation: { roll: 0, pitch: 0, yaw: 0 },
};

function makeWorldState(
  objects: SintPerceivedObject[] = [],
  anomalyFlags: SintAnomalyFlag[] = [],
  humanPresent = false,
): SintWorldState {
  return {
    timestamp: "2026-03-17T10:00:00.000000Z",
    objects,
    robotPose: DEFAULT_POSE,
    anomalyFlags,
    humanPresent,
  };
}

function makeObject(
  classLabel: string,
  confidence: number,
  isHuman = false,
): SintPerceivedObject {
  return {
    classLabel,
    confidence,
    boundingBox3D: {
      min: { x: 2, y: 2, z: 0 },
      max: { x: 3, y: 3, z: 1 },
    },
    isHuman,
  };
}

describe("ActionPredictor", () => {
  it("predict returns valid SintActionRecommendation", () => {
    const predictor = new ActionPredictor();
    const ws = makeWorldState([makeObject("box", 0.9)]);
    const rec = predictor.predict(ws);

    expect(rec.action).toBeDefined();
    expect(typeof rec.action).toBe("string");
    expect(rec.resource).toBeDefined();
    expect(typeof rec.confidence).toBe("number");
    expect(typeof rec.isSafetyRelevant).toBe("boolean");
    expect(rec.params).toBeDefined();
  });

  it("isSafetyRelevant is true when anomaly flags present", () => {
    const predictor = new ActionPredictor();
    const anomalyFlag: SintAnomalyFlag = {
      type: "low_confidence",
      severity: 0.7,
      source: "anomaly_detector",
      message: "Low confidence detected",
    };
    const ws = makeWorldState([makeObject("blob", 0.3)], [anomalyFlag]);
    const rec = predictor.predict(ws);
    expect(rec.isSafetyRelevant).toBe(true);
  });

  it("isSafetyRelevant is true when human detected", () => {
    const predictor = new ActionPredictor();
    const ws = makeWorldState(
      [makeObject("person", 0.95, true)],
      [],
      true,
    );
    const rec = predictor.predict(ws);
    expect(rec.isSafetyRelevant).toBe(true);
  });

  it("isSafetyRelevant is false for normal state", () => {
    const predictor = new ActionPredictor();
    const ws = makeWorldState([makeObject("box", 0.9)]);
    const rec = predictor.predict(ws);
    expect(rec.isSafetyRelevant).toBe(false);
    expect(rec.action).toBe("proceed");
  });

  it("confidence reflects world state quality", () => {
    const predictor = new ActionPredictor();

    // High confidence objects
    const highWs = makeWorldState([
      makeObject("box", 0.95),
      makeObject("table", 0.90),
    ]);
    const highRec = predictor.predict(highWs);

    // Low confidence objects
    const lowWs = makeWorldState([
      makeObject("blob", 0.3),
      makeObject("thing", 0.2),
    ]);
    const lowRec = predictor.predict(lowWs);

    expect(highRec.confidence).toBeGreaterThan(lowRec.confidence);
  });

  it("logs recommendation via onEvent callback", () => {
    const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
    const predictor = new ActionPredictor((evt) => events.push(evt));

    const ws = makeWorldState([makeObject("box", 0.9)]);
    predictor.predict(ws);

    expect(events.length).toBe(1);
    expect(events[0]!.eventType).toBe("engine.system1.action_recommendation");
    expect(events[0]!.payload["action"]).toBe("proceed");
    expect(events[0]!.payload["objectCount"]).toBe(1);
  });

  it("handles empty world state gracefully", () => {
    const predictor = new ActionPredictor();
    const ws = makeWorldState();
    const rec = predictor.predict(ws);
    expect(rec.action).toBe("proceed");
    expect(rec.confidence).toBe(1.0);
    expect(rec.isSafetyRelevant).toBe(false);
  });

  it("handles world state with no objects", () => {
    const predictor = new ActionPredictor();
    const ws: SintWorldState = {
      timestamp: "2026-03-17T10:00:00.000000Z",
      objects: [],
      robotPose: DEFAULT_POSE,
      anomalyFlags: [],
      humanPresent: false,
    };
    const rec = predictor.predict(ws);
    expect(rec.action).toBe("proceed");
    expect(rec.confidence).toBe(1.0);
    expect(rec.params).toBeDefined();
  });
});
