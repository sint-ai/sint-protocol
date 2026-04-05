import { useState, useEffect } from "react";

interface ApprovalItem {
  requestId: string;
  agentId: string;
  resource: string;
  action: string;
  tier: string;
  reason?: string;
  expiresAt?: string;
}

interface ApprovalPanelProps {
  approvals: ApprovalItem[];
  onApprove: (requestId: string) => void;
  onDeny: (requestId: string) => void;
}

function truncateId(id: string): string {
  if (id.length <= 20) return id;
  return id.slice(0, 8) + "..." + id.slice(-8);
}

function tierBadgeColor(tier: string): string {
  if (tier === "T3" || tier === "T3_COMMIT") return "#ff4444";
  if (tier === "T2" || tier === "T2_ACT")   return "#ffd700";
  return "#4da6ff";
}

function CountdownTimer({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(() => {
    const ms = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.floor(ms / 1000));
  });

  useEffect(() => {
    const timer = setInterval(() => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setRemaining(Math.max(0, Math.floor(ms / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  const color = remaining < 10 ? "#ff4444" : remaining < 30 ? "#ffd700" : "#8896b0";
  return (
    <span style={{ color, fontSize: "0.7rem" }}>
      {remaining > 0 ? `${remaining}s` : "EXPIRED"}
    </span>
  );
}

export function ApprovalPanel({ approvals, onApprove, onDeny }: ApprovalPanelProps) {
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
        PENDING APPROVALS
        {approvals.length > 0 && (
          <span style={{
            background: "#ff444422",
            border: "1px solid #ff4444",
            color: "#ff4444",
            borderRadius: "10px",
            padding: "0 6px",
            marginLeft: "8px",
            fontSize: "0.68rem",
          }}>
            {approvals.length}
          </span>
        )}
      </div>

      {approvals.length === 0 && (
        <div style={{ color: "#4a5670", fontSize: "0.78rem", textAlign: "center", padding: "24px 0" }}>
          No pending approvals
        </div>
      )}

      {approvals.map((approval) => {
        const tc = tierBadgeColor(approval.tier);
        return (
          <div key={approval.requestId} style={{
            background: "#0a1028",
            border: `1px solid ${tc}44`,
            borderLeft: `3px solid ${tc}`,
            borderRadius: "4px",
            padding: "10px",
            marginBottom: "8px",
          }}>
            {/* Resource + action */}
            <div style={{ color: "#e0e6f0", fontSize: "0.78rem", fontFamily: "monospace", marginBottom: "4px" }}>
              {approval.resource} <span style={{ color: "#8896b0" }}>{approval.action}</span>
            </div>

            {/* Tier + agent + expiry */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <span style={{
                background: tc + "22",
                border: `1px solid ${tc}`,
                color: tc,
                borderRadius: "3px",
                padding: "0 5px",
                fontSize: "0.68rem",
                fontWeight: 700,
              }}>
                {approval.tier}
              </span>
              <span style={{ color: "#8896b0", fontSize: "0.7rem", fontFamily: "monospace" }} title={approval.agentId}>
                {truncateId(approval.agentId)}
              </span>
              {approval.expiresAt && (
                <span style={{ marginLeft: "auto" }}>
                  <CountdownTimer expiresAt={approval.expiresAt} />
                </span>
              )}
            </div>

            {/* Reason */}
            {approval.reason && (
              <div style={{ color: "#6a7890", fontSize: "0.68rem", marginBottom: "8px", fontStyle: "italic" }}>
                {approval.reason}
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: "flex", gap: "6px" }}>
              <button
                onClick={() => onApprove(approval.requestId)}
                style={{
                  flex: 1,
                  background: "#00cc6622",
                  border: "1px solid #00cc66",
                  color: "#00cc66",
                  borderRadius: "3px",
                  padding: "4px 0",
                  cursor: "pointer",
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                }}
              >
                ✓ APPROVE
              </button>
              <button
                onClick={() => onDeny(approval.requestId)}
                style={{
                  flex: 1,
                  background: "#ff444422",
                  border: "1px solid #ff4444",
                  color: "#ff4444",
                  borderRadius: "3px",
                  padding: "4px 0",
                  cursor: "pointer",
                  fontFamily: "monospace",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                }}
              >
                ✗ DENY
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
