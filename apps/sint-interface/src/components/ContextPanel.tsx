interface ContextPanelProps {
  tokenScope?: string[];
  recentMemory?: Array<{ key: string; value: string }>;
  callsPerMinute?: number;
  maxCallsPerMinute?: number;
}

export function ContextPanel({
  tokenScope = [],
  recentMemory = [],
  callsPerMinute = 0,
  maxCallsPerMinute = 60,
}: ContextPanelProps) {
  const ratePercent = Math.min(100, (callsPerMinute / Math.max(1, maxCallsPerMinute)) * 100);
  const rateColor = ratePercent > 80 ? "#ff4444" : ratePercent > 50 ? "#ffd700" : "#00cc66";

  return (
    <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
      {/* Header */}
      <div style={{
        color: "#00d4ff",
        fontSize: "0.72rem",
        fontWeight: 700,
        letterSpacing: "0.1em",
        marginBottom: "12px",
        paddingBottom: "6px",
        borderBottom: "1px solid #1a2040",
      }}>
        CONTEXT
      </div>

      {/* Token scope */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ color: "#8896b0", fontSize: "0.68rem", marginBottom: "6px", letterSpacing: "0.05em" }}>
          TOKEN SCOPE
        </div>
        {tokenScope.length === 0 ? (
          <div style={{ color: "#4a5670", fontSize: "0.72rem" }}>—</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
            {tokenScope.map((scope, i) => (
              <div key={i} style={{
                color: "#60a5fa",
                fontSize: "0.68rem",
                fontFamily: "monospace",
                background: "#0a1028",
                border: "1px solid #1a3060",
                borderRadius: "3px",
                padding: "2px 6px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {scope}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent memory */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ color: "#8896b0", fontSize: "0.68rem", marginBottom: "6px", letterSpacing: "0.05em" }}>
          RECENT MEMORY
        </div>
        {recentMemory.length === 0 ? (
          <div style={{ color: "#4a5670", fontSize: "0.72rem" }}>No recalls</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {recentMemory.slice(0, 3).map((mem, i) => (
              <div key={i} style={{
                background: "#0a1028",
                border: "1px solid #1a2040",
                borderRadius: "3px",
                padding: "4px 6px",
              }}>
                <div style={{ color: "#ffd700", fontSize: "0.68rem", fontWeight: 700 }}>{mem.key}</div>
                <div style={{ color: "#c0cce0", fontSize: "0.68rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {mem.value}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tool call rate */}
      <div>
        <div style={{ color: "#8896b0", fontSize: "0.68rem", marginBottom: "6px", letterSpacing: "0.05em" }}>
          CALL RATE
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div style={{
            flex: 1,
            height: "6px",
            background: "#1a2040",
            borderRadius: "3px",
            overflow: "hidden",
          }}>
            <div style={{
              width: `${ratePercent}%`,
              height: "100%",
              background: rateColor,
              borderRadius: "3px",
              transition: "width 0.5s ease",
            }} />
          </div>
          <span style={{ color: rateColor, fontSize: "0.68rem", minWidth: "48px", textAlign: "right" }}>
            {callsPerMinute}/{maxCallsPerMinute}/m
          </span>
        </div>
      </div>
    </div>
  );
}
