/**
 * SINT Protocol — Evidence Ledger Reader unit tests.
 *
 * Tests the pure query and replay functions.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { LedgerWriter } from "../src/writer.js";
import { queryLedger, replayEvents } from "../src/reader.js";
import type { SintLedgerEvent } from "@pshkv/core";

describe("queryLedger", () => {
  const agent1 = "a".repeat(64);
  const agent2 = "b".repeat(64);
  let writer: LedgerWriter;
  let events: readonly SintLedgerEvent[];

  beforeEach(() => {
    writer = new LedgerWriter();

    writer.append({ eventType: "agent.registered", agentId: agent1, payload: {} });
    writer.append({ eventType: "policy.evaluated", agentId: agent1, payload: {} });
    writer.append({ eventType: "agent.registered", agentId: agent2, payload: {} });
    writer.append({ eventType: "action.completed", agentId: agent1, payload: {} });
    writer.append({ eventType: "policy.evaluated", agentId: agent2, payload: {} });

    events = writer.getAll();
  });

  it("filters by agentId", () => {
    const result = queryLedger(events, { agentId: agent1 });

    expect(result.length).toBe(3);
    expect(result.every((e) => e.agentId === agent1)).toBe(true);
  });

  it("filters by eventType", () => {
    const result = queryLedger(events, { eventType: "policy.evaluated" });

    expect(result.length).toBe(2);
    expect(result.every((e) => e.eventType === "policy.evaluated")).toBe(true);
  });

  it("filters by sequence range", () => {
    const result = queryLedger(events, { fromSequence: 2n, toSequence: 4n });

    expect(result.length).toBe(3);
    expect(result[0]!.sequenceNumber).toBe(2n);
    expect(result[2]!.sequenceNumber).toBe(4n);
  });

  it("applies limit and offset pagination", () => {
    const page1 = queryLedger(events, { limit: 2, offset: 0 });
    const page2 = queryLedger(events, { limit: 2, offset: 2 });

    expect(page1.length).toBe(2);
    expect(page2.length).toBe(2);
    expect(page1[0]!.sequenceNumber).toBe(1n);
    expect(page2[0]!.sequenceNumber).toBe(3n);
  });

  it("combines multiple filters", () => {
    const result = queryLedger(events, {
      agentId: agent1,
      eventType: "policy.evaluated",
    });

    expect(result.length).toBe(1);
    expect(result[0]!.agentId).toBe(agent1);
    expect(result[0]!.eventType).toBe("policy.evaluated");
  });

  it("returns empty array for no matches", () => {
    const result = queryLedger(events, { agentId: "c".repeat(64) });

    expect(result.length).toBe(0);
  });

  it("returns all events with no filters", () => {
    const result = queryLedger(events, {});

    expect(result.length).toBe(5);
  });
});

describe("replayEvents", () => {
  it("calls callback in sequence order", () => {
    const writer = new LedgerWriter();
    const agentId = "a".repeat(64);

    writer.append({ eventType: "agent.registered", agentId, payload: {} });
    writer.append({ eventType: "policy.evaluated", agentId, payload: {} });
    writer.append({ eventType: "action.completed", agentId, payload: {} });

    const events = writer.getAll();
    const seqNumbers: bigint[] = [];

    replayEvents(events, (event) => {
      seqNumbers.push(event.sequenceNumber);
    });

    expect(seqNumbers).toEqual([1n, 2n, 3n]);
  });

  it("handles out-of-order input by sorting", () => {
    const writer = new LedgerWriter();
    const agentId = "a".repeat(64);

    writer.append({ eventType: "agent.registered", agentId, payload: {} });
    writer.append({ eventType: "policy.evaluated", agentId, payload: {} });
    writer.append({ eventType: "action.completed", agentId, payload: {} });

    // Reverse the array to simulate out-of-order
    const reversed = [...writer.getAll()].reverse();
    const seqNumbers: bigint[] = [];

    replayEvents(reversed, (event) => {
      seqNumbers.push(event.sequenceNumber);
    });

    // Should still be in order
    expect(seqNumbers).toEqual([1n, 2n, 3n]);
  });

  it("calls callback for each event exactly once", () => {
    const writer = new LedgerWriter();
    const agentId = "a".repeat(64);

    writer.append({ eventType: "agent.registered", agentId, payload: {} });
    writer.append({ eventType: "policy.evaluated", agentId, payload: {} });

    const callback = vi.fn();
    replayEvents(writer.getAll(), callback);

    expect(callback).toHaveBeenCalledTimes(2);
  });
});
