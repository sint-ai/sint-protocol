import { useState } from "react";

interface MemoryEntry {
  key: string;
  value: unknown;
  tags: string[];
  storedAt: string;
  source: "working" | "operator" | "ledger";
  ledgerEventId?: string;
}

interface MemoryInspectorProps {
  entries: MemoryEntry[];
  onDelete?: (key: string) => void;
}

export function MemoryInspector({ entries, onDelete }: MemoryInspectorProps) {
  const [filter, setFilter] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = entries.filter(
    (e) =>
      e.key.toLowerCase().includes(filter.toLowerCase()) ||
      JSON.stringify(e.value).toLowerCase().includes(filter.toLowerCase()) ||
      e.tags.some((t) => t.toLowerCase().includes(filter.toLowerCase()))
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input
        type="text"
        placeholder="Filter memories..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 4,
          padding: "4px 8px",
          color: "#fff",
          fontSize: 11,
          outline: "none",
        }}
      />
      {filtered.length === 0 && (
        <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11 }}>No entries</div>
      )}
      {filtered.map((entry) => (
        <div
          key={entry.key}
          style={{
            background: "rgba(255,255,255,0.04)",
            borderRadius: 4,
            padding: "6px 8px",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <span style={{ color: "#4fc3f7", fontSize: 11, fontFamily: "monospace" }}>
              {entry.key}
            </span>
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <span style={{ color: entry.source === "operator" ? "#66bb6a" : "rgba(255,255,255,0.4)", fontSize: 10 }}>
                {entry.source}
              </span>
              {onDelete && (
                confirmDelete === entry.key ? (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button
                      onClick={() => { onDelete(entry.key); setConfirmDelete(null); }}
                      style={{ background: "#f44336", border: "none", borderRadius: 3, color: "#fff", padding: "1px 6px", fontSize: 10, cursor: "pointer" }}
                    >
                      confirm
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      style={{ background: "rgba(255,255,255,0.1)", border: "none", borderRadius: 3, color: "#fff", padding: "1px 6px", fontSize: 10, cursor: "pointer" }}
                    >
                      cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDelete(entry.key)}
                    style={{ background: "transparent", border: "1px solid rgba(244,67,54,0.4)", borderRadius: 3, color: "#f44336", padding: "1px 6px", fontSize: 10, cursor: "pointer" }}
                  >
                    del
                  </button>
                )
              )}
            </div>
          </div>
          <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 10, marginTop: 2 }}>
            {JSON.stringify(entry.value).slice(0, 80)}
            {JSON.stringify(entry.value).length > 80 && "…"}
          </div>
          {entry.tags.length > 0 && (
            <div style={{ display: "flex", gap: 4, marginTop: 3, flexWrap: "wrap" }}>
              {entry.tags.map((tag) => (
                <span
                  key={tag}
                  style={{ background: "rgba(79,195,247,0.15)", color: "#4fc3f7", borderRadius: 3, padding: "1px 5px", fontSize: 9 }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
          <div style={{ color: "rgba(255,255,255,0.25)", fontSize: 9, marginTop: 2 }}>
            {entry.storedAt.slice(0, 19).replace("T", " ")}
            {entry.ledgerEventId && ` · ${entry.ledgerEventId.slice(0, 8)}`}
          </div>
        </div>
      ))}
    </div>
  );
}
