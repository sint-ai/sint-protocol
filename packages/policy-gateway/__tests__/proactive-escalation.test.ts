/**
 * SINT Protocol — ProactiveEscalationEngine tests.
 *
 * 30+ tests covering:
 * - evaluate() with insufficient events → returns null
 * - evaluate() with nominal score → returns null
 * - evaluate() with score above threshold → returns EscalationAlert
 * - Alert cooldown: second call within cooldown → returns null
 * - Alert cooldown: call after cooldown expires → fires again
 * - clearCooldown() bypasses cooldown
 * - evaluateAgent() delegation to evaluate() with proper mapping
 * - evaluateAll() with multiple agents
 * - onAlert callback fired on alert
 * - Tier escalation: T0→T1, T1→T2, T2→T3, T3→T3 (cap)
 * - custom threshold
 * - alert fields are correct
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProactiveEscalationEngine } from "../src/proactive-escalation.js";
import type { EscalationAlert, EventSource } from "../src/proactive-escalation.js";
import { ApprovalTier } from "@sint/core";
import type { SintLedgerEvent } from "@sint/core";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const GENESIS = "0000000000000000000000000000000000000000000000000000000000000000";
const AGENT_A = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const AGENT_B = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

function makeEvent(
  seq: bigint,
  eventType: SintLedgerEvent["eventType"],
  agentId = AGENT_A,
  payload: Record<string, unknown> = {},
): SintLedgerEvent {
  return {
    eventId: `0190${seq.toString().padStart(20, "0")}-0000-7000-8000-000000000000` as any,
    sequenceNumber: seq,
    timestamp: new Date(Date.now() + Number(seq) * 1000)
      .toISOString()
      .replace(/\.(\d{3})Z$/, ".$1000Z"),
    eventType,
    agentId,
    tokenId: undefined,
    payload,
    previousHash: GENESIS,
    hash: GENESIS,
  };
}

/**
 * Build a set of events that pushes CSML above the 0.3 threshold.
 * Strategy: 10 request.received + 10 approval.denied → AR=1.0 → score ≈ 0.4+0.2+0.2-0.1+0.1 = 0.8
 */
function makeHighCsmlEvents(agentId = AGENT_A, count = 10): SintLedgerEvent[] {
  return [
    ...Array.from({ length: count }, (_, i) =>
      makeEvent(BigInt(i + 1), "request.received", agentId),
    ),
    ...Array.from({ length: count }, (_, i) =>
      makeEvent(BigInt(i + 100), "approval.denied", agentId),
    ),
  ];
}

/**
 * Build a set of events where all requests are allowed (AR=0).
 * We need ≥10 request events for a non-insufficient_data recommendation.
 */
function makeNominalEvents(agentId = AGENT_A, count = 10): SintLedgerEvent[] {
  return Array.from({ length: count }, (_, i) =>
    makeEvent(BigInt(i + 1), "request.received", agentId),
  );
}

/** Simple in-memory EventSource backed by a Map. */
function makeEventSource(
  eventsByAgent: Map<string, readonly SintLedgerEvent[]>,
): EventSource {
  return {
    getEventsForAgent: (id) => eventsByAgent.get(id) ?? [],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("ProactiveEscalationEngine — evaluate()", () => {
  it("returns null when event list is empty (insufficient_data)", async () => {
    const src = makeEventSource(new Map([[AGENT_A, []]]));
    const engine = new ProactiveEscalationEngine(src);
    const result = await engine.evaluate(AGENT_A, ApprovalTier.T0_OBSERVE);
    expect(result).toBeNull();
  });

  it("returns null when fewer than 10 request events (insufficient_data)", async () => {
    const events: SintLedgerEvent[] = [
      makeEvent(1n, "request.received"),
      makeEvent(2n, "approval.denied"),
    ];
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const engine = new ProactiveEscalationEngine(src);
    const result = await engine.evaluate(AGENT_A, ApprovalTier.T0_OBSERVE);
    expect(result).toBeNull();
  });

  it("returns null when CSML score is below threshold (nominal)", async () => {
    const events = makeNominalEvents(); // AR=0, score is low
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const engine = new ProactiveEscalationEngine(src);
    const result = await engine.evaluate(AGENT_A, ApprovalTier.T0_OBSERVE);
    expect(result).toBeNull();
  });

  it("returns EscalationAlert when CSML score exceeds threshold", async () => {
    const events = makeHighCsmlEvents();
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const engine = new ProactiveEscalationEngine(src);
    const result = await engine.evaluate(AGENT_A, ApprovalTier.T0_OBSERVE);
    expect(result).not.toBeNull();
    expect(result!.recommendation).toBe("escalate");
  });

  it("alert contains correct agentId", async () => {
    const events = makeHighCsmlEvents();
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const engine = new ProactiveEscalationEngine(src);
    const result = await engine.evaluate(AGENT_A, ApprovalTier.T1_PREPARE);
    expect(result!.agentId).toBe(AGENT_A);
  });

  it("alert contains correct threshold", async () => {
    const events = makeHighCsmlEvents();
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const engine = new ProactiveEscalationEngine(src, { threshold: 0.3 });
    const result = await engine.evaluate(AGENT_A, ApprovalTier.T0_OBSERVE);
    expect(result!.threshold).toBe(0.3);
  });

  it("alert csmlScore is above the threshold", async () => {
    const events = makeHighCsmlEvents();
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const engine = new ProactiveEscalationEngine(src);
    const result = await engine.evaluate(AGENT_A, ApprovalTier.T0_OBSERVE);
    expect(result!.csmlScore).toBeGreaterThan(0.3);
  });

  it("alert timestamp is an ISO 8601 string", async () => {
    const events = makeHighCsmlEvents();
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const engine = new ProactiveEscalationEngine(src);
    const result = await engine.evaluate(AGENT_A, ApprovalTier.T0_OBSERVE);
    expect(result!.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z$/);
  });

  it("alert eventCount matches number of events analyzed", async () => {
    const events = makeHighCsmlEvents(AGENT_A, 10);
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const engine = new ProactiveEscalationEngine(src);
    const result = await engine.evaluate(AGENT_A, ApprovalTier.T0_OBSERVE);
    expect(result!.eventCount).toBe(20); // 10 request + 10 denied
  });

  it("alert reason includes CSML score", async () => {
    const events = makeHighCsmlEvents();
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const engine = new ProactiveEscalationEngine(src);
    const result = await engine.evaluate(AGENT_A, ApprovalTier.T0_OBSERVE);
    expect(result!.reason).toContain("CSML score");
  });

  it("respects custom threshold — nominal at 3.0 (above computed score)", async () => {
    // With AR=1, BP=10 for 1 agent, score = 0.4*1 + 0.2*10 + ... = 2.5+
    // Setting threshold to 3.0 keeps it nominal
    const events = makeHighCsmlEvents();
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const engine = new ProactiveEscalationEngine(src, { threshold: 3.0 });
    const result = await engine.evaluate(AGENT_A, ApprovalTier.T0_OBSERVE);
    expect(result).toBeNull();
  });

  it("fires when score exceeds custom threshold of 0.1", async () => {
    const events = makeHighCsmlEvents(); // score ~0.8 >> 0.1
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const engine = new ProactiveEscalationEngine(src, { threshold: 0.1 });
    const result = await engine.evaluate(AGENT_A, ApprovalTier.T0_OBSERVE);
    expect(result).not.toBeNull();
  });
});

describe("ProactiveEscalationEngine — tier escalation", () => {
  async function escalate(
    tier: ApprovalTier,
  ): Promise<EscalationAlert | null> {
    const events = makeHighCsmlEvents();
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const engine = new ProactiveEscalationEngine(src);
    return engine.evaluate(AGENT_A, tier);
  }

  it("T0_OBSERVE escalates to T1_PREPARE", async () => {
    const alert = await escalate(ApprovalTier.T0_OBSERVE);
    expect(alert!.previousTier).toBe(ApprovalTier.T0_OBSERVE);
    expect(alert!.escalatedTier).toBe(ApprovalTier.T1_PREPARE);
  });

  it("T1_PREPARE escalates to T2_ACT", async () => {
    const alert = await escalate(ApprovalTier.T1_PREPARE);
    expect(alert!.previousTier).toBe(ApprovalTier.T1_PREPARE);
    expect(alert!.escalatedTier).toBe(ApprovalTier.T2_ACT);
  });

  it("T2_ACT escalates to T3_COMMIT", async () => {
    const alert = await escalate(ApprovalTier.T2_ACT);
    expect(alert!.previousTier).toBe(ApprovalTier.T2_ACT);
    expect(alert!.escalatedTier).toBe(ApprovalTier.T3_COMMIT);
  });

  it("T3_COMMIT stays at T3_COMMIT (ceiling)", async () => {
    const alert = await escalate(ApprovalTier.T3_COMMIT);
    expect(alert!.previousTier).toBe(ApprovalTier.T3_COMMIT);
    expect(alert!.escalatedTier).toBe(ApprovalTier.T3_COMMIT);
  });
});

describe("ProactiveEscalationEngine — cooldown", () => {
  it("second call within cooldown returns null", async () => {
    const events = makeHighCsmlEvents();
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const engine = new ProactiveEscalationEngine(src, { alertCooldownSeconds: 60 });

    const first = await engine.evaluate(AGENT_A, ApprovalTier.T0_OBSERVE);
    expect(first).not.toBeNull();

    const second = await engine.evaluate(AGENT_A, ApprovalTier.T0_OBSERVE);
    expect(second).toBeNull();
  });

  it("clearCooldown() allows immediate re-alert", async () => {
    const events = makeHighCsmlEvents();
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const engine = new ProactiveEscalationEngine(src, { alertCooldownSeconds: 60 });

    const first = await engine.evaluate(AGENT_A, ApprovalTier.T0_OBSERVE);
    expect(first).not.toBeNull();

    engine.clearCooldown(AGENT_A);

    const second = await engine.evaluate(AGENT_A, ApprovalTier.T0_OBSERVE);
    expect(second).not.toBeNull();
  });

  it("cooldown is per-agent: other agent not affected", async () => {
    const eventsA = makeHighCsmlEvents(AGENT_A);
    const eventsB = makeHighCsmlEvents(AGENT_B);
    const src = makeEventSource(
      new Map([
        [AGENT_A, eventsA],
        [AGENT_B, eventsB],
      ]),
    );
    const engine = new ProactiveEscalationEngine(src, { alertCooldownSeconds: 60 });

    await engine.evaluate(AGENT_A, ApprovalTier.T0_OBSERVE);

    // Agent B should still alert
    const alertB = await engine.evaluate(AGENT_B, ApprovalTier.T0_OBSERVE);
    expect(alertB).not.toBeNull();
    expect(alertB!.agentId).toBe(AGENT_B);
  });

  it("zero cooldown allows back-to-back alerts", async () => {
    const events = makeHighCsmlEvents();
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const engine = new ProactiveEscalationEngine(src, { alertCooldownSeconds: 0 });

    const first = await engine.evaluate(AGENT_A, ApprovalTier.T0_OBSERVE);
    const second = await engine.evaluate(AGENT_A, ApprovalTier.T0_OBSERVE);
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
  });
});

describe("ProactiveEscalationEngine — onAlert callback", () => {
  it("onAlert is called when alert is emitted", async () => {
    const events = makeHighCsmlEvents();
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const onAlert = vi.fn();
    const engine = new ProactiveEscalationEngine(src, { onAlert });

    await engine.evaluate(AGENT_A, ApprovalTier.T0_OBSERVE);
    expect(onAlert).toHaveBeenCalledTimes(1);
  });

  it("onAlert receives the correct EscalationAlert object", async () => {
    const events = makeHighCsmlEvents();
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const alerts: EscalationAlert[] = [];
    const engine = new ProactiveEscalationEngine(src, {
      onAlert: (a) => { alerts.push(a); },
    });

    const result = await engine.evaluate(AGENT_A, ApprovalTier.T1_PREPARE);
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toBe(result);
  });

  it("onAlert is NOT called for nominal score", async () => {
    const events = makeNominalEvents();
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const onAlert = vi.fn();
    const engine = new ProactiveEscalationEngine(src, { onAlert });

    await engine.evaluate(AGENT_A, ApprovalTier.T0_OBSERVE);
    expect(onAlert).not.toHaveBeenCalled();
  });

  it("onAlert is NOT called when in cooldown", async () => {
    const events = makeHighCsmlEvents();
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const onAlert = vi.fn();
    const engine = new ProactiveEscalationEngine(src, { onAlert, alertCooldownSeconds: 60 });

    await engine.evaluate(AGENT_A, ApprovalTier.T0_OBSERVE);
    await engine.evaluate(AGENT_A, ApprovalTier.T0_OBSERVE);
    expect(onAlert).toHaveBeenCalledTimes(1);
  });

  it("async onAlert is awaited before returning", async () => {
    const events = makeHighCsmlEvents();
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    let resolved = false;
    const onAlert = vi.fn().mockImplementation(async () => {
      await Promise.resolve();
      resolved = true;
    });
    const engine = new ProactiveEscalationEngine(src, { onAlert });

    await engine.evaluate(AGENT_A, ApprovalTier.T0_OBSERVE);
    expect(resolved).toBe(true);
  });
});

describe("ProactiveEscalationEngine — evaluateAgent()", () => {
  it("returns escalated:false and base tier when CSML is nominal", async () => {
    const events = makeNominalEvents();
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const engine = new ProactiveEscalationEngine(src);

    const result = await engine.evaluateAgent(AGENT_A, ApprovalTier.T1_PREPARE);
    expect(result.escalated).toBe(false);
    expect(result.resultTier).toBe(ApprovalTier.T1_PREPARE);
  });

  it("returns escalated:true and bumped tier when CSML exceeds threshold", async () => {
    const events = makeHighCsmlEvents();
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const engine = new ProactiveEscalationEngine(src);

    const result = await engine.evaluateAgent(AGENT_A, ApprovalTier.T0_OBSERVE);
    expect(result.escalated).toBe(true);
    expect(result.resultTier).toBe(ApprovalTier.T1_PREPARE);
  });

  it("returns csmlScore when escalated", async () => {
    const events = makeHighCsmlEvents();
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const engine = new ProactiveEscalationEngine(src);

    const result = await engine.evaluateAgent(AGENT_A, ApprovalTier.T0_OBSERVE);
    expect(result.csmlScore).toBeGreaterThan(0.3);
  });

  it("returns csmlScore null when not escalated", async () => {
    const events = makeNominalEvents();
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const engine = new ProactiveEscalationEngine(src);

    const result = await engine.evaluateAgent(AGENT_A, ApprovalTier.T0_OBSERVE);
    expect(result.csmlScore).toBeNull();
  });

  it("returns reason string when escalated", async () => {
    const events = makeHighCsmlEvents();
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const engine = new ProactiveEscalationEngine(src);

    const result = await engine.evaluateAgent(AGENT_A, ApprovalTier.T0_OBSERVE);
    expect(typeof result.reason).toBe("string");
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it("returns a reason string when not escalated", async () => {
    const events = makeNominalEvents();
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const engine = new ProactiveEscalationEngine(src);

    const result = await engine.evaluateAgent(AGENT_A, ApprovalTier.T0_OBSERVE);
    expect(typeof result.reason).toBe("string");
    expect(result.reason.length).toBeGreaterThan(0);
  });

  it("satisfies CsmlEscalationPlugin interface shape", async () => {
    const events = makeHighCsmlEvents();
    const src = makeEventSource(new Map([[AGENT_A, events]]));
    const engine = new ProactiveEscalationEngine(src);

    const result = await engine.evaluateAgent(AGENT_A, ApprovalTier.T2_ACT);
    expect(typeof result.escalated).toBe("boolean");
    expect(typeof result.resultTier).toBe("string");
    // csmlScore can be number or null per the interface
    expect(result.csmlScore === null || typeof result.csmlScore === "number").toBe(true);
  });
});

describe("ProactiveEscalationEngine — evaluateAll()", () => {
  it("returns empty array when no agents provided", async () => {
    const src = makeEventSource(new Map());
    const engine = new ProactiveEscalationEngine(src);

    const alerts = await engine.evaluateAll(new Map());
    expect(alerts).toHaveLength(0);
  });

  it("returns alerts for agents above threshold", async () => {
    const src = makeEventSource(
      new Map([
        [AGENT_A, makeHighCsmlEvents(AGENT_A)],
        [AGENT_B, makeNominalEvents(AGENT_B)],
      ]),
    );
    const engine = new ProactiveEscalationEngine(src);

    const alerts = await engine.evaluateAll(
      new Map([
        [AGENT_A, ApprovalTier.T0_OBSERVE],
        [AGENT_B, ApprovalTier.T0_OBSERVE],
      ]),
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0]!.agentId).toBe(AGENT_A);
  });

  it("returns alerts for all agents above threshold", async () => {
    const src = makeEventSource(
      new Map([
        [AGENT_A, makeHighCsmlEvents(AGENT_A)],
        [AGENT_B, makeHighCsmlEvents(AGENT_B)],
      ]),
    );
    const engine = new ProactiveEscalationEngine(src);

    const alerts = await engine.evaluateAll(
      new Map([
        [AGENT_A, ApprovalTier.T0_OBSERVE],
        [AGENT_B, ApprovalTier.T1_PREPARE],
      ]),
    );

    expect(alerts).toHaveLength(2);
    const agentIds = alerts.map((a) => a.agentId).sort();
    expect(agentIds).toEqual([AGENT_A, AGENT_B].sort());
  });

  it("returns empty array when all agents are nominal", async () => {
    const src = makeEventSource(
      new Map([
        [AGENT_A, makeNominalEvents(AGENT_A)],
        [AGENT_B, makeNominalEvents(AGENT_B)],
      ]),
    );
    const engine = new ProactiveEscalationEngine(src);

    const alerts = await engine.evaluateAll(
      new Map([
        [AGENT_A, ApprovalTier.T0_OBSERVE],
        [AGENT_B, ApprovalTier.T0_OBSERVE],
      ]),
    );

    expect(alerts).toHaveLength(0);
  });

  it("cooldown applies across evaluateAll calls", async () => {
    const src = makeEventSource(new Map([[AGENT_A, makeHighCsmlEvents(AGENT_A)]]));
    const engine = new ProactiveEscalationEngine(src, { alertCooldownSeconds: 60 });
    const agentMap = new Map([[AGENT_A, ApprovalTier.T0_OBSERVE]]);

    const first = await engine.evaluateAll(agentMap);
    expect(first).toHaveLength(1);

    const second = await engine.evaluateAll(agentMap);
    expect(second).toHaveLength(0);
  });
});
