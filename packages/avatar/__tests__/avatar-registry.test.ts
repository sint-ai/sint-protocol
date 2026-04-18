/**
 * AvatarRegistry tests — behavioral identity profile management.
 */

import { describe, it, expect } from "vitest";
import { AvatarRegistry, DEFAULT_CSML_THETA } from "../src/avatar-registry.js";
import type { SintLedgerEvent } from "@sint-ai/core";

const GENESIS = "0000000000000000000000000000000000000000000000000000000000000000";
const AGENT_A = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
const AGENT_B = "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3";

function makeEvent(
  agentId: string,
  seq: bigint,
  eventType: SintLedgerEvent["eventType"],
  payload: Record<string, unknown> = {}
): SintLedgerEvent {
  return {
    eventId: `event-${seq}` as any,
    sequenceNumber: seq,
    timestamp: new Date(Date.now() + Number(seq) * 1000).toISOString(),
    eventType,
    agentId,
    tokenId: undefined,
    payload,
    previousHash: GENESIS,
    hash: GENESIS,
  };
}

function makeRequestBatch(agentId: string, count: number, startSeq = 1n): SintLedgerEvent[] {
  return Array.from({ length: count }, (_, i) =>
    makeEvent(agentId, startSeq + BigInt(i), "request.received")
  );
}

describe("AvatarRegistry", () => {
  it("getOrCreate returns a profile with unknown persona for new agent", () => {
    const reg = new AvatarRegistry();
    const profile = reg.getOrCreate(AGENT_A);
    expect(profile.agentId).toBe(AGENT_A);
    expect(profile.persona).toBe("unknown");
    expect(profile.currentCsmlScore).toBeNull();
    expect(profile.csmlTheta).toBe(DEFAULT_CSML_THETA);
  });

  it("getOrCreate is idempotent — second call returns same profile", () => {
    const reg = new AvatarRegistry();
    const p1 = reg.getOrCreate(AGENT_A);
    const p2 = reg.getOrCreate(AGENT_A);
    expect(p1.createdAt).toBe(p2.createdAt);
  });

  it("get returns undefined for unknown agent", () => {
    const reg = new AvatarRegistry();
    expect(reg.get(AGENT_A)).toBeUndefined();
  });

  it("get returns profile after getOrCreate", () => {
    const reg = new AvatarRegistry();
    reg.getOrCreate(AGENT_A);
    expect(reg.get(AGENT_A)).toBeDefined();
  });

  it("size reflects number of profiles", () => {
    const reg = new AvatarRegistry();
    reg.getOrCreate(AGENT_A);
    reg.getOrCreate(AGENT_B);
    expect(reg.size).toBe(2);
  });

  it("list returns all profiles", () => {
    const reg = new AvatarRegistry();
    reg.getOrCreate(AGENT_A);
    reg.getOrCreate(AGENT_B);
    const profiles = reg.list();
    expect(profiles).toHaveLength(2);
    expect(profiles.some((p) => p.agentId === AGENT_A)).toBe(true);
    expect(profiles.some((p) => p.agentId === AGENT_B)).toBe(true);
  });

  it("updateFromEvents counts safety events", () => {
    const reg = new AvatarRegistry();
    const events: SintLedgerEvent[] = [
      ...makeRequestBatch(AGENT_A, 5),
      makeEvent(AGENT_A, 10n, "safety.force.exceeded"),
      makeEvent(AGENT_A, 11n, "safety.geofence.violation"),
    ];
    const profile = reg.updateFromEvents(AGENT_A, events);
    expect(profile.safetyEventCount).toBe(2);
    expect(profile.persona).toBe("anomalous");
  });

  it("updateFromEvents counts denied requests", () => {
    const reg = new AvatarRegistry();
    const events: SintLedgerEvent[] = [
      ...makeRequestBatch(AGENT_A, 10),
      makeEvent(AGENT_A, 20n, "approval.denied"),
      makeEvent(AGENT_A, 21n, "approval.denied"),
    ];
    const profile = reg.updateFromEvents(AGENT_A, events);
    expect(profile.deniedRequestCount).toBe(2);
  });

  it("filters events to only the target agent", () => {
    const reg = new AvatarRegistry();
    const events: SintLedgerEvent[] = [
      ...makeRequestBatch(AGENT_A, 5),
      ...makeRequestBatch(AGENT_B, 10, 100n),
    ];
    const profileA = reg.updateFromEvents(AGENT_A, events);
    expect(profileA.totalEventCount).toBe(5);
  });

  it("persona is compliant when CSML is below theta with no safety events", () => {
    const reg = new AvatarRegistry();
    // Many requests, none denied, all complete → low CSML
    const events: SintLedgerEvent[] = [
      ...makeRequestBatch(AGENT_A, 20),
      ...Array.from({ length: 20 }, (_, i) =>
        makeEvent(AGENT_A, BigInt(100 + i), "action.started")
      ),
      ...Array.from({ length: 20 }, (_, i) =>
        makeEvent(AGENT_A, BigInt(200 + i), "action.completed")
      ),
    ];
    const profile = reg.updateFromEvents(AGENT_A, events);
    expect(["compliant", "unknown"]).toContain(profile.persona);
  });

  it("persona is high_risk when CSML exceeds theta", () => {
    const reg = new AvatarRegistry();
    // Many denials → high AR → CSML > 0.3
    const events: SintLedgerEvent[] = [
      ...makeRequestBatch(AGENT_A, 20),
      ...Array.from({ length: 20 }, (_, i) =>
        makeEvent(AGENT_A, BigInt(50 + i), "approval.denied")
      ),
    ];
    const profile = reg.updateFromEvents(AGENT_A, events);
    expect(profile.persona).toBe("high_risk");
    expect(profile.currentCsmlScore).toBeGreaterThan(DEFAULT_CSML_THETA);
  });

  it("recordEscalation increments escalationCount", () => {
    const reg = new AvatarRegistry();
    reg.getOrCreate(AGENT_A);
    expect(reg.get(AGENT_A)!.escalationCount).toBe(0);
    reg.recordEscalation(AGENT_A);
    reg.recordEscalation(AGENT_A);
    expect(reg.get(AGENT_A)!.escalationCount).toBe(2);
  });

  it("setTheta overrides per-agent threshold", () => {
    const reg = new AvatarRegistry();
    reg.getOrCreate(AGENT_A);
    reg.setTheta(AGENT_A, 0.1);
    expect(reg.get(AGENT_A)!.csmlTheta).toBe(0.1);
  });

  it("updateFromEvents is idempotent — calling twice with same events", () => {
    const reg = new AvatarRegistry();
    const events = makeRequestBatch(AGENT_A, 5);
    const p1 = reg.updateFromEvents(AGENT_A, events);
    const p2 = reg.updateFromEvents(AGENT_A, events);
    expect(p1.totalEventCount).toBe(p2.totalEventCount);
    expect(p1.safetyEventCount).toBe(p2.safetyEventCount);
  });
});
