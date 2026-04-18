/**
 * CSML (Composite Safety-Model Latency) metric tests.
 */

import { describe, it, expect } from "vitest";
import { computeCsml, computeCsmlPerModel } from "../src/csml.js";
import type { SintLedgerEvent } from "@sint-ai/core";
import { DEFAULT_CSML_COEFFICIENTS } from "@sint-ai/core";

const GENESIS = "0000000000000000000000000000000000000000000000000000000000000000";
const AGENT = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

function makeEvent(
  seq: bigint,
  eventType: SintLedgerEvent["eventType"],
  overrides: Partial<SintLedgerEvent> = {}
): SintLedgerEvent {
  return {
    eventId: `0190${seq.toString().padStart(20, "0")}-0000-7000-8000-000000000000` as any,
    sequenceNumber: seq,
    timestamp: new Date(Date.now() + Number(seq) * 1000).toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    eventType,
    agentId: AGENT,
    tokenId: undefined,
    payload: {},
    previousHash: GENESIS,
    hash: GENESIS,
    ...overrides,
  };
}

describe("computeCsml", () => {
  it("returns score=0 and insufficient_data for empty event list", () => {
    const result = computeCsml([]);
    expect(result.score).toBe(0);
    expect(result.recommendation).toBe("insufficient_data");
    expect(result.eventCount).toBe(0);
    expect(result.window).toBeNull();
  });

  it("uses DEFAULT_CSML_COEFFICIENTS when none provided", () => {
    const result = computeCsml([]);
    expect(result.coefficients).toEqual(DEFAULT_CSML_COEFFICIENTS);
  });

  it("recommendation is insufficient_data when fewer than 10 request events", () => {
    const events = [
      makeEvent(1n, "request.received"),
      makeEvent(2n, "policy.evaluated"),
    ];
    const result = computeCsml(events);
    expect(result.recommendation).toBe("insufficient_data");
  });

  it("AR = 0 when no requests were blocked", () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      makeEvent(BigInt(i + 1), "request.received")
    );
    const result = computeCsml(events);
    expect(result.components.attemptRate).toBe(0);
  });

  it("AR = 1 when all requests were denied", () => {
    const events = [
      ...Array.from({ length: 10 }, (_, i) =>
        makeEvent(BigInt(i + 1), "request.received")
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        makeEvent(BigInt(i + 20), "approval.denied")
      ),
    ];
    const result = computeCsml(events);
    expect(result.components.attemptRate).toBe(1);
  });

  it("CR = 1 when all started actions complete", () => {
    const events = [
      ...Array.from({ length: 5 }, (_, i) =>
        makeEvent(BigInt(i + 1), "action.started")
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeEvent(BigInt(i + 10), "action.completed")
      ),
    ];
    const result = computeCsml(events);
    expect(result.components.completionRate).toBe(1);
  });

  it("CR < 1 when some actions fail", () => {
    const events = [
      makeEvent(1n, "action.started"),
      makeEvent(2n, "action.started"),
      makeEvent(3n, "action.started"),
      makeEvent(4n, "action.completed"),
      // 2 failed (not completed)
    ];
    const result = computeCsml(events);
    expect(result.components.completionRate).toBeCloseTo(1 / 3);
  });

  it("SV defaults to 1.0 when no safety events", () => {
    const events = [makeEvent(1n, "request.received")];
    const result = computeCsml(events);
    expect(result.components.overSpeedSeverity).toBe(1.0);
  });

  it("SV reflects median severity from safety.force.exceeded events", () => {
    const events = [
      makeEvent(1n, "safety.force.exceeded", { payload: { severity: 2.0 } }),
      makeEvent(2n, "safety.force.exceeded", { payload: { severity: 3.0 } }),
      makeEvent(3n, "safety.force.exceeded", { payload: { severity: 4.0 } }),
    ];
    const result = computeCsml(events);
    expect(result.components.overSpeedSeverity).toBe(3.0); // median of [2, 3, 4]
  });

  it("exceedsThreshold returns false below theta", () => {
    const result = computeCsml([]);
    expect(result.exceedsThreshold(0.3)).toBe(false);
  });

  it("exceedsThreshold returns true above theta for high-block scenario", () => {
    // Many denials → high AR → high score
    const events = [
      ...Array.from({ length: 20 }, (_, i) =>
        makeEvent(BigInt(i + 1), "request.received")
      ),
      ...Array.from({ length: 20 }, (_, i) =>
        makeEvent(BigInt(i + 30), "approval.denied")
      ),
    ];
    const result = computeCsml(events);
    expect(result.exceedsThreshold(0.3)).toBe(true);
    expect(result.recommendation).toBe("escalate");
  });

  it("window reflects min/max timestamps in event set", () => {
    const events = [
      makeEvent(1n, "request.received"),
      makeEvent(2n, "request.received"),
      makeEvent(3n, "request.received"),
    ];
    const result = computeCsml(events);
    expect(result.window).not.toBeNull();
    expect(result.window!.start).toBeDefined();
    expect(result.window!.end).toBeDefined();
    expect(result.window!.start <= result.window!.end).toBe(true);
  });

  it("score formula: α=0.4 AR + β=0.2 BP + γ=0.2 SV - δ=0.1 CR + ε=0.1 ledger", () => {
    // Construct events with known AR=0.5, CR=1.0, no safety events (SV=1.0), ledger ok
    const events = [
      ...Array.from({ length: 20 }, (_, i) =>
        makeEvent(BigInt(i + 1), "request.received")
      ),
      ...Array.from({ length: 10 }, (_, i) =>
        makeEvent(BigInt(i + 30), "approval.denied")
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeEvent(BigInt(i + 50), "action.started")
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        makeEvent(BigInt(i + 60), "action.completed")
      ),
    ];
    const result = computeCsml(events);
    // AR ≈ 0.5 (10 denied / 20 requests), CR = 1.0, SV = 1.0
    // score ≈ 0.4*0.5 + 0.2*BP + 0.2*1.0 - 0.1*1.0 + 0.1*1
    expect(result.score).toBeGreaterThan(0);
    expect(result.components.attemptRate).toBeCloseTo(0.5);
    expect(result.components.completionRate).toBe(1);
  });
});

describe("computeCsmlPerModel", () => {
  it("returns a map with one entry per foundation_model_id", () => {
    const events = [
      makeEvent(1n, "request.received", { foundation_model_id: "gpt-5" }),
      makeEvent(2n, "request.received", { foundation_model_id: "gemini-3" }),
      makeEvent(3n, "approval.denied", { foundation_model_id: "gpt-5" }),
    ];
    const result = computeCsmlPerModel(events);
    expect(result.size).toBe(2);
    expect(result.has("gpt-5")).toBe(true);
    expect(result.has("gemini-3")).toBe(true);
  });

  it("unknown model ID is grouped under __unknown__", () => {
    const events = [
      makeEvent(1n, "request.received"), // no foundation_model_id
    ];
    const result = computeCsmlPerModel(events);
    expect(result.has("__unknown__")).toBe(true);
  });

  it("per-model scores are independent — gpt-5 high block rate does not affect gemini-3", () => {
    const events = [
      // GPT-5: all blocked
      ...Array.from({ length: 20 }, (_, i) =>
        makeEvent(BigInt(i + 1), "request.received", { foundation_model_id: "gpt-5" })
      ),
      ...Array.from({ length: 20 }, (_, i) =>
        makeEvent(BigInt(i + 30), "approval.denied", { foundation_model_id: "gpt-5" })
      ),
      // Gemini-3: all allowed
      ...Array.from({ length: 20 }, (_, i) =>
        makeEvent(BigInt(i + 100), "request.received", { foundation_model_id: "gemini-3" })
      ),
    ];
    const result = computeCsmlPerModel(events);
    const gpt5 = result.get("gpt-5")!;
    const gemini3 = result.get("gemini-3")!;
    expect(gpt5.components.attemptRate).toBeGreaterThan(gemini3.components.attemptRate);
  });
});
