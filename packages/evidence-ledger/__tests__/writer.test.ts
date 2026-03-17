/**
 * SINT Protocol — Evidence Ledger Writer unit tests.
 *
 * Tests the append-only, hash-chained audit log.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { LedgerWriter } from "../src/writer.js";

describe("LedgerWriter", () => {
  const agentId = "a".repeat(64);
  let writer: LedgerWriter;

  beforeEach(() => {
    writer = new LedgerWriter();
  });

  it("first event has sequenceNumber 1n", () => {
    const event = writer.append({
      eventType: "agent.registered",
      agentId,
      payload: { name: "test" },
    });

    expect(event.sequenceNumber).toBe(1n);
  });

  it("first event's previousHash is the genesis hash", () => {
    const event = writer.append({
      eventType: "agent.registered",
      agentId,
      payload: {},
    });

    expect(event.previousHash).toBe(
      "0000000000000000000000000000000000000000000000000000000000000000",
    );
  });

  it("second event's previousHash equals first event's hash", () => {
    const first = writer.append({
      eventType: "agent.registered",
      agentId,
      payload: {},
    });
    const second = writer.append({
      eventType: "policy.evaluated",
      agentId,
      payload: {},
    });

    expect(second.previousHash).toBe(first.hash);
  });

  it("hash is a valid 64-char hex string (SHA-256)", () => {
    const event = writer.append({
      eventType: "agent.registered",
      agentId,
      payload: {},
    });

    expect(event.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("verifyChain() returns ok for valid chain", () => {
    writer.append({ eventType: "agent.registered", agentId, payload: {} });
    writer.append({ eventType: "policy.evaluated", agentId, payload: {} });
    writer.append({ eventType: "action.completed", agentId, payload: {} });

    const result = writer.verifyChain();
    expect(result.ok).toBe(true);
  });

  it("length increments correctly", () => {
    expect(writer.length).toBe(0);

    writer.append({ eventType: "agent.registered", agentId, payload: {} });
    expect(writer.length).toBe(1);

    writer.append({ eventType: "policy.evaluated", agentId, payload: {} });
    expect(writer.length).toBe(2);
  });

  it("headHash equals the last event's hash", () => {
    const e1 = writer.append({ eventType: "agent.registered", agentId, payload: {} });
    expect(writer.headHash).toBe(e1.hash);

    const e2 = writer.append({ eventType: "policy.evaluated", agentId, payload: {} });
    expect(writer.headHash).toBe(e2.hash);
  });

  it("getBySequence returns the correct event", () => {
    writer.append({ eventType: "agent.registered", agentId, payload: {} });
    const second = writer.append({ eventType: "policy.evaluated", agentId, payload: {} });

    const found = writer.getBySequence(2n);
    expect(found?.eventId).toBe(second.eventId);
  });

  it("getBySequence returns undefined for non-existent sequence", () => {
    writer.append({ eventType: "agent.registered", agentId, payload: {} });

    expect(writer.getBySequence(99n)).toBeUndefined();
  });

  it("getAll returns a copy (not the internal array)", () => {
    writer.append({ eventType: "agent.registered", agentId, payload: {} });

    const all = writer.getAll();
    expect(all.length).toBe(1);

    // Modifying returned array should not affect the writer
    (all as any[]).push({ fake: true });
    expect(writer.getAll().length).toBe(1);
  });

  it("eventId is a valid UUID v7 format", () => {
    const event = writer.append({
      eventType: "agent.registered",
      agentId,
      payload: {},
    });

    expect(event.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("timestamp is valid ISO 8601 with microsecond precision", () => {
    const event = writer.append({
      eventType: "agent.registered",
      agentId,
      payload: {},
    });

    expect(event.timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/,
    );
  });

  it("sequence numbers are monotonically increasing", () => {
    const e1 = writer.append({ eventType: "agent.registered", agentId, payload: {} });
    const e2 = writer.append({ eventType: "policy.evaluated", agentId, payload: {} });
    const e3 = writer.append({ eventType: "action.completed", agentId, payload: {} });

    expect(e1.sequenceNumber).toBe(1n);
    expect(e2.sequenceNumber).toBe(2n);
    expect(e3.sequenceNumber).toBe(3n);
  });
});
