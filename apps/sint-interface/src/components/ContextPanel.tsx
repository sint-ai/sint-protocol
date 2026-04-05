import { useState } from "react";
import { MemoryInspector } from "./MemoryInspector.js";
import { TransparencyFeed } from "./TransparencyFeed.js";
import type { TransparencyEvent } from "./TransparencyFeed.js";
import { ConstraintEditor } from "./ConstraintEditor.js";
import type { BehavioralConstraints } from "./ConstraintEditor.js";

type Tab = "SCOPE" | "MEMORY" | "TRANSPARENCY" | "CONSTRAINTS";

interface ContextPanelProps {
  tokenScope?: string[];
  recentMemory?: Array<{ key: string; value: string }>;
  callsPerMinute?: number;
  maxCallsPerMinute?: number;
}

// Mock data for governance panels (until real API is wired)
const MOCK_MEMORY_ENTRIES = [
  {
    key: "last_waypoint",
    value: { x: 1.2, y: 3.4, z: 0.0 },
    tags: ["navigation", "position"],
    storedAt: "2026-04-05T10:22:00.000000Z",
    source: "working" as const,
  },
  {
    key: "operator_override",
    value: "allow_high_speed",
    tags: ["policy", "operator"],
    storedAt: "2026-04-05T09:11:00.000000Z",
    source: "operator" as const,
    ledgerEventId: "01900000-0000-7000-0000-000000000001",
  },
];

const MOCK_TRANSPARENCY_EVENTS: TransparencyEvent[] = [
  {
    id: "te-1",
    timestamp: "2026-04-05T10:22:05Z",
    agentIntent: "Move to docking station",
    gatewayDecision: "allow",
    tier: "T1",
    resource: "ros2:///cmd_vel",
    matched: true,
  },
  {
    id: "te-2",
    timestamp: "2026-04-05T10:21:50Z",
    agentIntent: "Execute shell command",
    gatewayDecision: "deny",
    tier: "T3",
    resource: "mcp://exec/run",
    matched: false,
  },
];

const MOCK_TOKEN_ID = "01900000-0000-7000-0000-000000000042";
const MOCK_CONSTRAINTS: BehavioralConstraints = {
  maxCallsPerMinute: 30,
  deniedPatterns: ["/emergency_stop"],
};

export function ContextPanel({
  tokenScope = [],
  recentMemory = [],
  callsPerMinute = 0,
  maxCallsPerMinute = 60,
}: ContextPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>("SCOPE");
  const [memoryEntries, setMemoryEntries] = useState(MOCK_MEMORY_ENTRIES);

  const ratePercent = Math.min(100, (callsPerMinute / Math.max(1, maxCallsPerMinute)) * 100);
  const rateColor = ratePercent > 80 ? "#ff4444" : ratePercent > 50 ? "#ffd700" : "#00cc66";

  const tabs: Tab[] = ["SCOPE", "MEMORY", "TRANSPARENCY", "CONSTRAINTS"];

  function handleDeleteMemory(key: string) {
    setMemoryEntries((prev) => prev.filter((e) => e.key !== key));
  }

  function handleSaveConstraints(_tokenId: string, _constraints: BehavioralConstraints) {
    // No-op placeholder until API is wired
  }

  return (
    <div style={{ fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
      {/* Header */}
      <div style={{
        color: "#00d4ff",
        fontSize: "0.72rem",
        fontWeight: 700,
        letterSpacing: "0.1em",
        marginBottom: "10px",
        paddingBottom: "6px",
        borderBottom: "1px solid #1a2040",
      }}>
        CONTEXT
      </div>

      {/* Tab bar */}
      <div style={{
        display: "flex",
        gap: 2,
        marginBottom: 12,
        borderBottom: "1px solid #1a2040",
        paddingBottom: 0,
      }}>
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid #00d4ff" : "2px solid transparent",
              color: activeTab === tab ? "#00d4ff" : "rgba(255,255,255,0.35)",
              fontSize: "0.6rem",
              letterSpacing: "0.05em",
              padding: "3px 5px 5px",
              cursor: "pointer",
              fontFamily: "inherit",
              transition: "color 0.15s",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "SCOPE" && (
        <>
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
        </>
      )}

      {activeTab === "MEMORY" && (
        <MemoryInspector
          entries={memoryEntries}
          onDelete={handleDeleteMemory}
        />
      )}

      {activeTab === "TRANSPARENCY" && (
        <TransparencyFeed events={MOCK_TRANSPARENCY_EVENTS} />
      )}

      {activeTab === "CONSTRAINTS" && (
        <ConstraintEditor
          tokenId={MOCK_TOKEN_ID}
          constraints={MOCK_CONSTRAINTS}
          onSave={handleSaveConstraints}
        />
      )}
    </div>
  );
}
