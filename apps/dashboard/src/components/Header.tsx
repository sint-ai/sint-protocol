/**
 * SINT Dashboard — Header Component.
 *
 * Shows the SINT logo, connection status, and health stats.
 */

import type { HealthResponse } from "../api/types.js";

interface HeaderProps {
  health: HealthResponse | null;
  sseConnected: boolean;
  pendingCount: number;
}

export function Header({ health, sseConnected, pendingCount }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-left">
        <h1 className="logo">
          <span className="logo-icon">&#x1F6E1;</span>
          <span className="logo-text">SINT</span>
          <span className="logo-sub">Approval Dashboard</span>
        </h1>
      </div>

      <div className="header-center">
        {pendingCount > 0 && (
          <div className="pending-badge">
            <span className="badge-pulse" />
            <span className="badge-count">{pendingCount}</span>
            <span className="badge-label">pending</span>
          </div>
        )}
      </div>

      <div className="header-right">
        <div className={`status-dot ${sseConnected ? "connected" : "disconnected"}`} />
        <span className="status-label">
          {sseConnected ? "Live" : "Offline"}
        </span>

        {health && (
          <div className="health-stats">
            <span className="stat" title="Active tokens">
              <span className="stat-icon">&#x1F511;</span> {health.tokens}
            </span>
            <span className="stat" title="Ledger events">
              <span className="stat-icon">&#x1F4DC;</span> {health.ledgerEvents}
            </span>
            <span className="stat" title="Revoked tokens">
              <span className="stat-icon">&#x1F6AB;</span> {health.revokedTokens}
            </span>
          </div>
        )}
      </div>
    </header>
  );
}
