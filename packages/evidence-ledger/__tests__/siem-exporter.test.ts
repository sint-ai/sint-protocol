/**
 * SINT Protocol — SIEM Exporter unit tests.
 *
 * Tests RFC 5424 syslog, JSON Lines, and CEF output formatting.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { LedgerWriter } from "../src/writer.js";
import {
  formatSyslog,
  formatJsonLine,
  formatCef,
  exportBatch,
} from "../src/siem-exporter.js";
import type { SintLedgerEvent } from "@sint-ai/core";

const AGENT_ID = "a".repeat(64);

function buildEvent(
  writer: LedgerWriter,
  eventType: Parameters<LedgerWriter["append"]>[0]["eventType"] = "policy.evaluated",
): SintLedgerEvent {
  return writer.append({ eventType, agentId: AGENT_ID, payload: {} });
}

describe("SIEM Exporter", () => {
  let writer: LedgerWriter;
  let event: SintLedgerEvent;

  beforeEach(() => {
    writer = new LedgerWriter();
    event = buildEvent(writer);
  });

  // ── RFC 5424 syslog ───────────────────────────────────────────────────────

  it("syslog output starts with < priority >", () => {
    const line = formatSyslog(event);
    // Must begin with <N>1 where N is the PRI value
    expect(line).toMatch(/^<\d+>1 /);
  });

  it("syslog includes structured data [sint@...]", () => {
    const line = formatSyslog(event);
    expect(line).toContain("[sint@32473 ");
  });

  it("policy.denied maps to severity 4 (warning) — PRI = facility*8 + 4", () => {
    const denied = writer.append({
      eventType: "policy.evaluated", // use a valid event type as proxy
      agentId: AGENT_ID,
      payload: { decision: "deny" },
    });
    // Directly test a syslog line for a policy.denied-like event
    // We'll construct an event with eventType that maps to severity 4
    const mockEvent: SintLedgerEvent = { ...denied, eventType: "approval.denied" as any };
    // The severity 4 case is for "policy.denied" — test that path via a crafted call
    const policyDeniedEvent: SintLedgerEvent = {
      ...event,
      eventType: "policy.evaluated" as any,
    };
    // Test the actual mapping: policy.denied → severity 4 → PRI = 1*8+4 = 12
    const customEvent: SintLedgerEvent = {
      ...event,
      eventType: "policy.denied" as any,
    };
    const line = formatSyslog(customEvent, { format: "syslog-rfc5424", facility: 1 });
    // PRI = 1 * 8 + 4 = 12
    expect(line).toMatch(/^<12>1 /);
  });

  it("agent.supply_chain.violation maps to severity 2 (critical) — PRI = 1*8+2 = 10", () => {
    const supplyChainEvent: SintLedgerEvent = {
      ...event,
      eventType: "agent.supply_chain.violation" as any,
    };
    const line = formatSyslog(supplyChainEvent, { format: "syslog-rfc5424", facility: 1 });
    // PRI = 1 * 8 + 2 = 10
    expect(line).toMatch(/^<10>1 /);
  });

  // ── JSON Lines ────────────────────────────────────────────────────────────

  it("json-lines output is valid JSON", () => {
    const line = formatJsonLine(event);
    expect(() => JSON.parse(line)).not.toThrow();
    const parsed = JSON.parse(line);
    expect(parsed).toBeTruthy();
    expect(typeof parsed).toBe("object");
  });

  // ── CEF ───────────────────────────────────────────────────────────────────

  it("cef output starts with CEF:0|SINT|", () => {
    const line = formatCef(event);
    expect(line).toMatch(/^CEF:0\|SINT\|/);
  });

  // ── exportBatch ───────────────────────────────────────────────────────────

  it("exportBatch returns one line per event", () => {
    const e1 = buildEvent(writer, "action.started");
    const e2 = buildEvent(writer, "action.completed");
    const e3 = buildEvent(writer, "safety.estop.triggered");

    const result = exportBatch([e1, e2, e3], { format: "json-lines" });
    const lines = result.split("\n");
    expect(lines).toHaveLength(3);
  });

  // ── All formats include eventId and agentId ───────────────────────────────

  it("all formats include eventId and agentId", () => {
    const syslogLine = formatSyslog(event);
    const jsonLine = formatJsonLine(event);
    const cefLine = formatCef(event);

    // syslog — eventId appears in structured data and MSGID fields
    expect(syslogLine).toContain(event.eventId);
    expect(syslogLine).toContain(event.agentId);

    // json-lines — full event serialized
    const parsed = JSON.parse(jsonLine);
    expect(parsed.eventId).toBe(event.eventId);
    expect(parsed.agentId).toBe(event.agentId);

    // CEF — eventId and agentId in extension
    expect(cefLine).toContain(event.eventId);
    expect(cefLine).toContain(event.agentId);
  });
});
