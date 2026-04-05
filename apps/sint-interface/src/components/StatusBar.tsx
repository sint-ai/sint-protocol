import { useState, useEffect } from "react";

interface StatusBarProps {
  agentId?: string;
  currentTier?: "T0" | "T1" | "T2" | "T3";
  circuitBreakerState?: "CLOSED" | "OPEN" | "HALF_OPEN";
  connectionStatus?: "connected" | "disconnected" | "reconnecting";
}

function tierColor(tier?: "T0" | "T1" | "T2" | "T3"): string {
  switch (tier) {
    case "T0": return "#8896b0";
    case "T1": return "#4da6ff";
    case "T2": return "#ffd700";
    case "T3": return "#ff4444";
    default:   return "#8896b0";
  }
}

function circuitBreakerIcon(state?: "CLOSED" | "OPEN" | "HALF_OPEN"): { icon: string; color: string; label: string } {
  switch (state) {
    case "CLOSED":    return { icon: "○", color: "#00cc66", label: "CLOSED" };
    case "OPEN":      return { icon: "●", color: "#ff4444", label: "OPEN" };
    case "HALF_OPEN": return { icon: "◑", color: "#ffd700", label: "HALF-OPEN" };
    default:          return { icon: "○", color: "#00cc66", label: "CLOSED" };
  }
}

function connectionDot(status?: "connected" | "disconnected" | "reconnecting"): { color: string; label: string } {
  switch (status) {
    case "connected":    return { color: "#00cc66", label: "LIVE" };
    case "reconnecting": return { color: "#ffd700", label: "RECONNECTING" };
    case "disconnected": return { color: "#ff4444", label: "OFFLINE" };
    default:             return { color: "#8896b0", label: "UNKNOWN" };
  }
}

export function StatusBar({ agentId, currentTier, circuitBreakerState, connectionStatus }: StatusBarProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const truncatedDid = agentId
    ? agentId.length > 20
      ? agentId.slice(0, 20) + "..."
      : agentId
    : "—";

  const cb = circuitBreakerIcon(circuitBreakerState);
  const conn = connectionDot(connectionStatus);
  const tc = tierColor(currentTier);

  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      height: "48px",
      background: "#0a0e1a",
      borderBottom: "1px solid #1a2040",
      padding: "0 16px",
      gap: "20px",
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: "0.78rem",
    }}>
      {/* Title */}
      <span style={{ color: "#00d4ff", fontWeight: 700, fontSize: "0.9rem", letterSpacing: "0.1em" }}>
        SINT OPERATOR
      </span>

      {/* Divider */}
      <span style={{ color: "#1a2040" }}>|</span>

      {/* Agent DID */}
      <span style={{ color: "#8896b0" }}>DID:</span>
      <span style={{ color: "#c0cce0", fontFamily: "monospace", fontSize: "0.75rem" }} title={agentId}>
        {truncatedDid}
      </span>

      {/* Divider */}
      <span style={{ color: "#1a2040" }}>|</span>

      {/* Tier badge */}
      {currentTier && (
        <span style={{
          background: tc + "22",
          border: `1px solid ${tc}`,
          color: tc,
          borderRadius: "3px",
          padding: "1px 8px",
          fontWeight: 700,
          fontSize: "0.72rem",
          letterSpacing: "0.05em",
        }}>
          {currentTier}
        </span>
      )}

      {/* Circuit breaker state */}
      <span style={{ color: cb.color, fontWeight: 700 }}>
        {cb.icon} {cb.label}
      </span>

      {/* Spacer */}
      <span style={{ flex: 1 }} />

      {/* Connection status */}
      <span style={{ color: conn.color, fontSize: "0.72rem" }}>
        ● {conn.label}
      </span>

      {/* Clock */}
      <span style={{ color: "#8896b0", fontFamily: "monospace", minWidth: "80px", textAlign: "right" }}>
        {timeStr}
      </span>
    </div>
  );
}
