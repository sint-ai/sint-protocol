/**
 * SINT Dashboard — Pending Approvals Component.
 *
 * Shows all pending approval requests with approve/deny buttons.
 * Updates in real-time via SSE.
 */

import { useState } from "react";
import type { ApprovalRequest } from "../api/types.js";
import { resolveApproval } from "../api/client.js";

interface PendingApprovalsProps {
  requests: ApprovalRequest[];
  onResolved: () => void;
}

const TIER_COLORS: Record<string, string> = {
  T0_OBSERVE: "var(--tier-0)",
  T1_PREPARE: "var(--tier-1)",
  T2_ACT: "var(--tier-2)",
  T3_COMMIT: "var(--tier-3)",
};

function tierColor(tier: string): string {
  return TIER_COLORS[tier] ?? "var(--text-muted)";
}

function timeRemaining(expiresAt: string): string {
  const ms = new Date(expiresAt).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

export function PendingApprovals({ requests, onResolved }: PendingApprovalsProps) {
  const [resolving, setResolving] = useState<Set<string>>(new Set());

  async function handleResolve(requestId: string, status: "approved" | "denied") {
    setResolving((prev) => new Set(prev).add(requestId));
    try {
      await resolveApproval(requestId, {
        status,
        by: "dashboard-operator",
      });
      onResolved();
    } catch (err) {
      console.error("Failed to resolve approval:", err);
    } finally {
      setResolving((prev) => {
        const next = new Set(prev);
        next.delete(requestId);
        return next;
      });
    }
  }

  if (requests.length === 0) {
    return (
      <section className="panel">
        <h2 className="panel-title">Pending Approvals</h2>
        <div className="empty-state">
          <span className="empty-icon">&#x2705;</span>
          <p>No pending approvals</p>
          <p className="text-muted">All clear. Approvals will appear here in real-time.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <h2 className="panel-title">
        Pending Approvals
        <span className="panel-count">{requests.length}</span>
      </h2>

      <div className="approval-list">
        {requests.map((req) => (
          <div key={req.requestId} className="approval-card">
            <div className="approval-header">
              <span
                className="tier-badge"
                style={{ background: tierColor(req.requiredTier) }}
              >
                {req.requiredTier}
              </span>
              <span className="approval-timer">
                &#x23F1; {timeRemaining(req.expiresAt)}
              </span>
            </div>

            <div className="approval-body">
              <div className="approval-field">
                <span className="field-label">Resource</span>
                <code className="field-value">{req.resource}</code>
              </div>
              <div className="approval-field">
                <span className="field-label">Action</span>
                <code className="field-value">{req.action}</code>
              </div>
              <div className="approval-field">
                <span className="field-label">Agent</span>
                <code className="field-value agent-id">{req.agentId}</code>
              </div>
              {req.reason && (
                <div className="approval-field">
                  <span className="field-label">Reason</span>
                  <span className="field-value">{req.reason}</span>
                </div>
              )}
            </div>

            <div className="approval-actions">
              <button
                className="btn btn-approve"
                disabled={resolving.has(req.requestId)}
                onClick={() => void handleResolve(req.requestId, "approved")}
              >
                {resolving.has(req.requestId) ? "..." : "Approve"}
              </button>
              <button
                className="btn btn-deny"
                disabled={resolving.has(req.requestId)}
                onClick={() => void handleResolve(req.requestId, "denied")}
              >
                {resolving.has(req.requestId) ? "..." : "Deny"}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
