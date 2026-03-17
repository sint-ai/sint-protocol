/**
 * SINT Dashboard — Audit Log Component.
 *
 * Shows recent ledger events with chain integrity status.
 */

import type { LedgerResponse } from "../api/types.js";

interface AuditLogProps {
  ledger: LedgerResponse | null;
  loading: boolean;
}

const EVENT_ICONS: Record<string, string> = {
  "request.received": "\u{1F4E5}",
  "request.allowed": "\u{2705}",
  "request.denied": "\u{1F6D1}",
  "request.escalated": "\u{26A0}",
  "approval.granted": "\u{1F44D}",
  "approval.denied": "\u{1F44E}",
  "agent.capability.granted": "\u{1F511}",
  "agent.capability.revoked": "\u{1F6AB}",
  "session.start": "\u{1F680}",
  "session.end": "\u{1F3C1}",
};

function eventIcon(type: string): string {
  return EVENT_ICONS[type] ?? "\u{1F4CB}";
}

function formatTime(ts: string): string {
  try {
    const date = new Date(ts);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return ts;
  }
}

function eventColor(type: string): string {
  if (type.includes("denied") || type.includes("revoked")) return "var(--danger)";
  if (type.includes("allowed") || type.includes("granted")) return "var(--success)";
  if (type.includes("escalated")) return "var(--warning)";
  return "var(--text-muted)";
}

export function AuditLog({ ledger, loading }: AuditLogProps) {
  return (
    <section className="panel">
      <h2 className="panel-title">
        Audit Log
        {ledger && (
          <span className="panel-meta">
            {ledger.chainIntegrity ? (
              <span className="chain-ok" title="Hash chain verified">&#x1F512; Chain OK</span>
            ) : (
              <span className="chain-broken" title="Chain integrity failure">&#x26A0; Chain Broken</span>
            )}
          </span>
        )}
      </h2>

      {loading && !ledger && (
        <div className="loading">Loading audit events...</div>
      )}

      {ledger && ledger.events.length === 0 && (
        <div className="empty-state">
          <p className="text-muted">No audit events yet.</p>
        </div>
      )}

      {ledger && ledger.events.length > 0 && (
        <div className="audit-list">
          {ledger.events.map((event) => (
            <div key={event.eventId} className="audit-row">
              <span className="audit-icon">{eventIcon(event.eventType)}</span>
              <span className="audit-time">{formatTime(event.timestamp)}</span>
              <span
                className="audit-type"
                style={{ color: eventColor(event.eventType) }}
              >
                {event.eventType}
              </span>
              <span className="audit-agent" title={event.agentId}>
                {event.agentId.length > 16
                  ? `${event.agentId.slice(0, 8)}...${event.agentId.slice(-8)}`
                  : event.agentId}
              </span>
              {event.payload && typeof event.payload === "object" && (
                <span className="audit-detail">
                  {summarizePayload(event.payload)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {ledger && (
        <div className="panel-footer">
          <span className="text-muted">
            Showing {ledger.events.length} of {ledger.total} events
          </span>
        </div>
      )}
    </section>
  );
}

function summarizePayload(payload: Record<string, unknown>): string {
  const parts: string[] = [];

  if (payload["resource"]) parts.push(`${payload["resource"]}`);
  if (payload["action"]) parts.push(`${payload["action"]}`);
  if (payload["decision"]) parts.push(`-> ${payload["decision"]}`);
  if (payload["reason"]) parts.push(`(${payload["reason"]})`);

  return parts.length > 0 ? parts.join(" ") : "";
}
