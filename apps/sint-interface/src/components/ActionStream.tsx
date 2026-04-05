import { useEffect, useRef } from "react";

interface StreamEvent {
  id: string;
  timestamp: string;
  type: "APPROVAL_REQUIRED" | "DECISION";
  agentId?: string;
  resource?: string;
  action?: string;
  decision?: "allow" | "deny" | "escalate" | "transform";
  tier?: string;
}

interface ActionStreamProps {
  events: StreamEvent[];
}

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

function eventColor(event: StreamEvent): string {
  if (event.type === "APPROVAL_REQUIRED") return "#ffb74d";
  switch (event.decision) {
    case "allow":
      if (event.tier === "T0" || event.tier === "T0_OBSERVE") return "#6b7280";
      if (event.tier === "T1" || event.tier === "T1_PREPARE") return "#60a5fa";
      return "#60a5fa";
    case "deny":      return "#f87171";
    case "escalate":
      if (event.tier === "T2" || event.tier === "T2_ACT")    return "#fbbf24";
      if (event.tier === "T3" || event.tier === "T3_COMMIT") return "#fb923c";
      return "#fbbf24";
    case "transform": return "#34d399";
    default:          return "#8896b0";
  }
}

function eventLabel(event: StreamEvent): string {
  if (event.type === "APPROVAL_REQUIRED") return "ESCALATE";
  return event.decision?.toUpperCase() ?? "—";
}

export function ActionStream({ events }: ActionStreamProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const displayEvents = events.slice(-50);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [events.length]);

  return (
    <div>
      <div style={{
        color: "#00d4ff",
        fontSize: "0.72rem",
        fontWeight: 700,
        letterSpacing: "0.1em",
        marginBottom: "12px",
        paddingBottom: "6px",
        borderBottom: "1px solid #1a2040",
      }}>
        ACTION STREAM
        <span style={{ color: "#4a5670", fontWeight: 400, marginLeft: "8px" }}>
          {events.length} events
        </span>
      </div>

      {displayEvents.length === 0 && (
        <div style={{ color: "#4a5670", fontSize: "0.78rem", textAlign: "center", padding: "24px 0" }}>
          Awaiting events...
        </div>
      )}

      <div ref={listRef} style={{ overflowY: "auto", maxHeight: "calc(100vh - 200px)" }}>
        {displayEvents.map((event, idx) => {
          const color = eventColor(event);
          const label = eventLabel(event);
          const isPulse = event.type === "APPROVAL_REQUIRED";

          return (
            <div
              key={`${event.id}-${idx}`}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
                padding: "5px 6px",
                borderLeft: `2px solid ${color}`,
                marginBottom: "3px",
                background: isPulse ? color + "11" : "transparent",
                animation: isPulse ? "pulse 2s ease-in-out infinite" : undefined,
              }}
            >
              <span style={{ color: "#4a5670", fontSize: "0.68rem", minWidth: "60px", paddingTop: "1px" }}>
                {formatTime(event.timestamp)}
              </span>
              <span style={{ color, fontSize: "0.72rem", fontWeight: 700, minWidth: "72px" }}>
                {label}
              </span>
              {event.tier && (
                <span style={{
                  color: "#8896b0",
                  fontSize: "0.68rem",
                  border: "1px solid #2a3050",
                  borderRadius: "3px",
                  padding: "0 4px",
                  minWidth: "48px",
                  textAlign: "center",
                }}>
                  {event.tier}
                </span>
              )}
              <span style={{
                color: "#c0cce0",
                fontSize: "0.72rem",
                fontFamily: "monospace",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {event.resource} {event.action ? `→ ${event.action}` : ""}
              </span>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
