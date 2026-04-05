/**
 * SINT Dashboard — Live Approval Feed Component.
 *
 * Shows a real-time feed of T2/T3 gateway decisions and escalations
 * delivered via the WebSocket approval stream.
 *
 * Color coding:
 *  - APPROVAL_REQUIRED (escalate) → yellow (--warning)
 *  - DECISION: deny               → red (--danger)
 *  - DECISION: allow / transform  → green (--success)
 *  - DECISION: escalate           → yellow (--warning)
 *
 * Tier badges use the existing --tier-2 / --tier-3 design tokens.
 * Auto-scrolls to the latest event. Caps at 50 events (enforced by the hook).
 */

import { useEffect, useRef } from "react";
import type { ApprovalStreamEvent } from "../api/types.js";
import { useApprovalStream } from "../hooks/useApprovalStream.js";

interface ApprovalFeedProps {
  /** Optional explicit gateway URL; defaults to VITE_GATEWAY_URL. */
  gatewayUrl?: string;
  /** Optional API key forwarded to the WebSocket connection. */
  apiKey?: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(ts: string): string {
  try {
    return new Date(ts).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return ts;
  }
}

/** Truncate a long agent ID to first 8 + last 8 chars. */
function truncateId(id: string): string {
  if (id.length <= 20) return id;
  return `${id.slice(0, 8)}…${id.slice(-8)}`;
}

/** Row background tint colour based on event semantics. */
function rowAccentColor(event: ApprovalStreamEvent): string {
  if (event.type === "APPROVAL_REQUIRED") return "var(--warning)";
  // DECISION
  switch (event.decision) {
    case "allow":
    case "transform":
      return "var(--success)";
    case "deny":
      return "var(--danger)";
    case "escalate":
      return "var(--warning)";
    default:
      return "var(--text-muted)";
  }
}

/** Short human-readable label for the event type + decision. */
function eventLabel(event: ApprovalStreamEvent): string {
  if (event.type === "APPROVAL_REQUIRED") return "ESCALATE";
  return event.decision.toUpperCase();
}

/** Tier badge background colour from design tokens. */
function tierBadgeColor(tier: string): string {
  if (tier === "T2_ACT") return "var(--tier-2)";
  if (tier === "T3_COMMIT") return "var(--tier-3)";
  return "var(--text-muted)";
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ApprovalFeed({ gatewayUrl, apiKey }: ApprovalFeedProps) {
  const { events, connected } = useApprovalStream(gatewayUrl, apiKey);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest event whenever the list grows
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events.length]);

  return (
    <section className="panel">
      <h2 className="panel-title">
        Live Decision Feed
        <span className="panel-meta">
          {connected ? (
            <span className="chain-ok" title="WebSocket connected">
              &#x25CF; live
            </span>
          ) : (
            <span style={{ color: "var(--text-muted)" }} title="WebSocket reconnecting">
              &#x25CB; reconnecting&#x2026;
            </span>
          )}
        </span>
      </h2>

      {events.length === 0 && (
        <div className="empty-state">
          <span className="empty-icon">&#x1F4E1;</span>
          <p>No T2/T3 decisions yet</p>
          <p className="text-muted">
            Physical-action and commit-tier decisions will stream here in real time.
          </p>
        </div>
      )}

      {events.length > 0 && (
        <div
          ref={listRef}
          className="audit-list"
          style={{ maxHeight: "360px", overflowY: "auto" }}
        >
          {events.map((event, idx) => {
            const accent = rowAccentColor(event);
            const label = eventLabel(event);
            return (
              <div
                /* Use index as fallback key — events have no unique id in the stream */
                key={`${event.requestId}-${idx}`}
                className="audit-row"
                style={{ borderLeft: `3px solid ${accent}`, paddingLeft: "8px" }}
              >
                {/* Timestamp */}
                <span className="audit-time">{formatTime(event.timestamp)}</span>

                {/* Event type badge */}
                <span
                  className="audit-type"
                  style={{ color: accent, fontWeight: 600, minWidth: "80px" }}
                >
                  {label}
                </span>

                {/* Tier badge */}
                <span
                  className="tier-badge"
                  style={{
                    background: tierBadgeColor(event.tier),
                    fontSize: "0.7rem",
                    padding: "1px 6px",
                    borderRadius: "var(--radius-sm)",
                    color: "#0a0e17",
                    fontWeight: 700,
                  }}
                >
                  {event.tier}
                </span>

                {/* Agent ID */}
                <span className="audit-agent" title={event.agentId}>
                  {truncateId(event.agentId)}
                </span>

                {/* Resource + action */}
                <span className="audit-detail" style={{ fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}>
                  {event.resource} &rarr; {event.action}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {events.length > 0 && (
        <div className="panel-footer">
          <span className="text-muted">
            {events.length} event{events.length !== 1 ? "s" : ""} (max 50 retained)
          </span>
        </div>
      )}
    </section>
  );
}
