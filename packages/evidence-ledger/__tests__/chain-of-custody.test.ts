/**
 * SINT Protocol — Chain-of-Custody Proof unit tests.
 *
 * Tests NIST-style hash-chain proofs for ledger events.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { LedgerWriter } from "../src/writer.js";
import { generateProof, verifyProof } from "../src/chain-of-custody.js";
import type { SintLedgerEvent } from "@pshkv/core";

const AGENT_ID = "b".repeat(64);

/** Build a 5-event chain and return [writer, events]. */
function buildChain(): [LedgerWriter, SintLedgerEvent[]] {
  const writer = new LedgerWriter();
  const events: SintLedgerEvent[] = [
    writer.append({ eventType: "agent.registered",   agentId: AGENT_ID, payload: {} }),
    writer.append({ eventType: "request.received",   agentId: AGENT_ID, payload: {} }),
    writer.append({ eventType: "policy.evaluated",   agentId: AGENT_ID, payload: {} }),
    writer.append({ eventType: "action.started",     agentId: AGENT_ID, payload: {} }),
    writer.append({ eventType: "action.completed",   agentId: AGENT_ID, payload: {} }),
  ];
  return [writer, events];
}

describe("Chain-of-Custody Proofs", () => {
  let writer: LedgerWriter;
  let events: SintLedgerEvent[];

  beforeEach(() => {
    [writer, events] = buildChain();
  });

  it("generateProof returns a defined proof for an event in a 5-event chain", () => {
    const target = events[2]!; // middle event
    const proof = generateProof([...events], target.eventId);
    expect(proof).toBeDefined();
    expect(proof!.eventId).toBe(target.eventId);
    expect(proof!.chainPosition).toBe(2);
  });

  it("proofValid=true for an untampered chain", () => {
    const target = events[4]!; // last event
    const proof = generateProof([...events], target.eventId);
    expect(proof).toBeDefined();
    expect(proof!.proofValid).toBe(true);
    // All verification steps should be valid
    for (const step of proof!.verificationSteps) {
      expect(step.valid).toBe(true);
    }
  });

  it("proofValid=false if any event hash is modified", () => {
    // Tamper with event at index 1 by changing its hash
    const tampered = events.map((e, i) =>
      i === 1 ? ({ ...e, hash: "deadbeef" + "0".repeat(56) }) : e,
    ) as SintLedgerEvent[];

    const target = tampered[4]!;
    const proof = generateProof(tampered, target.eventId);
    expect(proof).toBeDefined();
    expect(proof!.proofValid).toBe(false);
  });

  it("verifyProof=true for a valid proof and matching event", () => {
    const target = events[3]!;
    const proof = generateProof([...events], target.eventId);
    expect(proof).toBeDefined();
    const valid = verifyProof(proof!, target);
    expect(valid).toBe(true);
  });

  it("verifyProof=false for a tampered event", () => {
    const target = events[3]!;
    const proof = generateProof([...events], target.eventId);
    expect(proof).toBeDefined();

    // Tamper the event — alter its hash so it no longer matches the proof
    const tamperedEvent: SintLedgerEvent = {
      ...target,
      hash: "cafebabe" + "0".repeat(56),
    };

    const valid = verifyProof(proof!, tamperedEvent);
    expect(valid).toBe(false);
  });

  it("generateProof returns undefined for an unknown eventId", () => {
    const proof = generateProof([...events], "non-existent-event-id");
    expect(proof).toBeUndefined();
  });
});
