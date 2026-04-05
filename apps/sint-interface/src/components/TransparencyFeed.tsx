
export interface TransparencyEvent {
  id: string;
  timestamp: string;
  agentIntent?: string;        // from sint__speak text or sint__show_hud data
  gatewayDecision: "allow" | "deny" | "escalate" | "transform";
  tier: string;
  resource: string;
  matched: boolean;            // true if intent aligns with decision
}

interface TransparencyFeedProps {
  events: TransparencyEvent[];
}

const DECISION_COLOR: Record<string, string> = {
  allow: "#66bb6a",
  deny: "#f44336",
  escalate: "#ffd700",
  transform: "#ab47bc",
};

export function TransparencyFeed({ events }: TransparencyFeedProps) {
  if (events.length === 0) {
    return (
      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, padding: 8 }}>
        No transparency events yet
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflowY: "auto" }}>
      {events.slice().reverse().map((evt) => (
        <div
          key={evt.id}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
            background: "rgba(255,255,255,0.03)",
            borderRadius: 4,
            padding: "5px 7px",
            borderLeft: `2px solid ${DECISION_COLOR[evt.gatewayDecision] ?? "#666"}`,
          }}
        >
          <div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, marginBottom: 1 }}>AGENT INTENT</div>
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: 10 }}>
              {evt.agentIntent ?? <span style={{ color: "rgba(255,255,255,0.25)" }}>—</span>}
            </div>
          </div>
          <div>
            <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 9, marginBottom: 1 }}>GATEWAY</div>
            <div style={{ color: DECISION_COLOR[evt.gatewayDecision] ?? "#ccc", fontSize: 10, fontWeight: 600 }}>
              {evt.gatewayDecision.toUpperCase()}
              <span style={{ color: "rgba(255,255,255,0.35)", fontWeight: 400, marginLeft: 4 }}>
                [{evt.tier}]
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
