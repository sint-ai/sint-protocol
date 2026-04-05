import type { CSSProperties } from "react";
import { useState } from "react";

export interface BehavioralConstraints {
  maxCallsPerMinute?: number;
  deniedPatterns?: string[];
  allowedPatterns?: string[];
  maxPayloadBytes?: number;
}

interface ConstraintEditorProps {
  tokenId: string;
  constraints: BehavioralConstraints;
  onSave?: (tokenId: string, constraints: BehavioralConstraints) => void;
}

export function ConstraintEditor({ tokenId, constraints, onSave }: ConstraintEditorProps) {
  const [maxCpm, setMaxCpm] = useState(String(constraints.maxCallsPerMinute ?? ""));
  const [maxPayload, setMaxPayload] = useState(String(constraints.maxPayloadBytes ?? ""));
  const [deniedPatterns, setDeniedPatterns] = useState(
    (constraints.deniedPatterns ?? []).join("\n")
  );
  const [dirty, setDirty] = useState(false);

  const handleSave = () => {
    const updated: BehavioralConstraints = {};
    if (maxCpm) updated.maxCallsPerMinute = parseInt(maxCpm, 10);
    if (maxPayload) updated.maxPayloadBytes = parseInt(maxPayload, 10);
    if (deniedPatterns.trim()) updated.deniedPatterns = deniedPatterns.split("\n").map((s) => s.trim()).filter(Boolean);
    onSave?.(tokenId, updated);
    setDirty(false);
  };

  const inputStyle: CSSProperties = {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 4,
    padding: "3px 6px",
    color: "#fff",
    fontSize: 11,
    outline: "none",
    width: "100%",
    boxSizing: "border-box",
  };

  const labelStyle: CSSProperties = {
    color: "rgba(255,255,255,0.5)",
    fontSize: 10,
    marginBottom: 2,
    display: "block",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, fontFamily: "monospace" }}>
        token: {tokenId.slice(0, 16)}…
      </div>
      <div>
        <label style={labelStyle}>Max calls / min</label>
        <input
          type="number"
          value={maxCpm}
          onChange={(e) => { setMaxCpm(e.target.value); setDirty(true); }}
          style={inputStyle}
          placeholder="unlimited"
        />
      </div>
      <div>
        <label style={labelStyle}>Max payload bytes</label>
        <input
          type="number"
          value={maxPayload}
          onChange={(e) => { setMaxPayload(e.target.value); setDirty(true); }}
          style={inputStyle}
          placeholder="unlimited"
        />
      </div>
      <div>
        <label style={labelStyle}>Denied patterns (one per line)</label>
        <textarea
          value={deniedPatterns}
          onChange={(e) => { setDeniedPatterns(e.target.value); setDirty(true); }}
          style={{ ...inputStyle, resize: "vertical", minHeight: 50 }}
          placeholder={"/cmd_vel\n/emergency_stop"}
        />
      </div>
      {dirty && (
        <button
          onClick={handleSave}
          style={{
            background: "#1e88e5",
            border: "none",
            borderRadius: 4,
            color: "#fff",
            padding: "5px 12px",
            fontSize: 11,
            cursor: "pointer",
            alignSelf: "flex-start",
          }}
        >
          Apply constraints
        </button>
      )}
    </div>
  );
}
