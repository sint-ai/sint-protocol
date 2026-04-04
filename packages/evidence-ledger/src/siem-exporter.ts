/**
 * SINT Evidence Ledger — SIEM/SOC Export
 *
 * Exports ledger events in RFC 5424 syslog format for SIEM ingestion.
 * Supports: syslog (RFC 5424), JSON Lines, CEF (Common Event Format).
 *
 * @module @sint/gate-evidence-ledger/siem-exporter
 */

import type { SintLedgerEvent } from "@sint/core";

export type SiemFormat = "syslog-rfc5424" | "json-lines" | "cef";

export interface SiemExportOptions {
  readonly format: SiemFormat;
  /** Syslog facility (default 1 = user-level). */
  readonly facility?: number;
  /** Syslog hostname field. */
  readonly hostname?: string;
  /** Syslog APP-NAME (default "sint-gateway"). */
  readonly appName?: string;
}

/**
 * Map a SINT event type to a RFC 5424 syslog severity number.
 *
 * Severity mapping:
 *   - policy.denied          → 4 (Warning)
 *   - agent.supply_chain.violation → 2 (Critical)
 *   - everything else        → 6 (Informational)
 */
function eventSeverity(eventType: string): number {
  if (eventType === "policy.denied") return 4;
  if (eventType === "agent.supply_chain.violation") return 2;
  return 6;
}

/**
 * Compute the RFC 5424 PRI value.
 * PRI = (facility * 8) + severity
 */
function pri(facility: number, severity: number): number {
  return facility * 8 + severity;
}

/**
 * Escape a structured data param value per RFC 5424 (§6.3.3).
 */
function escapeSdParam(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/]/g, "\\]");
}

/**
 * Format a single ledger event as RFC 5424 syslog.
 *
 * Example output:
 *   <14>1 2026-04-04T12:00:00.000000Z hostname sint-gateway - eventId [sint@32473 eventId="..." agentId="..."] eventType
 */
export function formatSyslog(event: SintLedgerEvent, opts?: SiemExportOptions): string {
  const facility = opts?.facility ?? 1;
  const hostname = opts?.hostname ?? "-";
  const appName = opts?.appName ?? "sint-gateway";
  const severity = eventSeverity(event.eventType);
  const priVal = pri(facility, severity);

  // RFC 5424 STRUCTURED-DATA
  const sd = `[sint@32473 eventId="${escapeSdParam(event.eventId)}" agentId="${escapeSdParam(event.agentId)}" eventType="${escapeSdParam(event.eventType)}"]`;

  // RFC 5424: <PRI>VERSION TIMESTAMP HOSTNAME APP-NAME PROCID MSGID SD MSG
  return `<${priVal}>1 ${event.timestamp} ${hostname} ${appName} - ${event.eventId} ${sd} ${event.eventType}`;
}

/**
 * Format as JSON Lines (one JSON object per line, Elastic/Splunk compatible).
 *
 * sequenceNumber is serialized as a string to avoid JSON BigInt issues.
 */
export function formatJsonLine(event: SintLedgerEvent): string {
  const obj = {
    ...event,
    sequenceNumber: event.sequenceNumber.toString(),
  };
  return JSON.stringify(obj);
}

/**
 * CEF severity mapping (0–10 scale).
 *   RFC 5424 severity 2 (Critical) → CEF 9
 *   RFC 5424 severity 4 (Warning)  → CEF 6
 *   RFC 5424 severity 6 (Info)     → CEF 3
 */
function cefSeverity(eventType: string): number {
  if (eventType === "agent.supply_chain.violation") return 9;
  if (eventType === "policy.denied") return 6;
  return 3;
}

/**
 * Escape a CEF extension value (pipes and backslashes).
 */
function escapeCefExtension(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/=/g, "\\=").replace(/\n/g, "\\n");
}

/**
 * Format as ArcSight CEF (Common Event Format).
 *
 * CEF:0|SINT|PhysicalAIGateway|0.2|<eventType>|<description>|<severity>|...
 */
export function formatCef(event: SintLedgerEvent, opts?: SiemExportOptions): string {
  const severity = cefSeverity(event.eventType);
  const appName = opts?.appName ?? "sint-gateway";

  // CEF header: Version|Device Vendor|Device Product|Device Version|Signature ID|Name|Severity
  const header = `CEF:0|SINT|PhysicalAIGateway|0.2|${event.eventType}|SINT Evidence Ledger Event|${severity}`;

  // CEF extension key=value pairs
  const ext = [
    `eventId=${escapeCefExtension(event.eventId)}`,
    `agentId=${escapeCefExtension(event.agentId)}`,
    `rt=${escapeCefExtension(event.timestamp)}`,
    `app=${escapeCefExtension(appName)}`,
    `cs1=${escapeCefExtension(event.hash)}`,
    `cs1Label=eventHash`,
  ].join(" ");

  return `${header}|${ext}`;
}

/**
 * Export a batch of events in the specified format (one line per event).
 */
export function exportBatch(events: SintLedgerEvent[], opts: SiemExportOptions): string {
  const lines = events.map((event) => {
    switch (opts.format) {
      case "syslog-rfc5424":
        return formatSyslog(event, opts);
      case "json-lines":
        return formatJsonLine(event);
      case "cef":
        return formatCef(event, opts);
    }
  });
  return lines.join("\n");
}
