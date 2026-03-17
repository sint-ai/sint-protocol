/**
 * SINT Dashboard — Overview Cards Component.
 *
 * Displays key metrics in card format at the top of the dashboard.
 */

import type { HealthResponse, LedgerResponse } from "../api/types.js";

interface OverviewCardsProps {
  health: HealthResponse | null;
  ledger: LedgerResponse | null;
  pendingCount: number;
  sseConnected: boolean;
}

interface CardDef {
  label: string;
  value: string | number;
  icon: string;
  color: string;
}

export function OverviewCards({ health, ledger, pendingCount, sseConnected }: OverviewCardsProps) {
  const cards: CardDef[] = [
    {
      label: "Pending Approvals",
      value: pendingCount,
      icon: "\u{23F3}",
      color: pendingCount > 0 ? "var(--warning)" : "var(--success)",
    },
    {
      label: "Active Tokens",
      value: health?.tokens ?? "-",
      icon: "\u{1F511}",
      color: "var(--accent)",
    },
    {
      label: "Ledger Events",
      value: health?.ledgerEvents ?? "-",
      icon: "\u{1F4DC}",
      color: "var(--info)",
    },
    {
      label: "Chain Integrity",
      value: ledger?.chainIntegrity ? "Verified" : ledger ? "Broken" : "-",
      icon: ledger?.chainIntegrity ? "\u{1F512}" : "\u{1F513}",
      color: ledger?.chainIntegrity ? "var(--success)" : ledger ? "var(--danger)" : "var(--text-muted)",
    },
    {
      label: "Revoked Tokens",
      value: health?.revokedTokens ?? "-",
      icon: "\u{1F6AB}",
      color: (health?.revokedTokens ?? 0) > 0 ? "var(--danger)" : "var(--text-muted)",
    },
    {
      label: "Connection",
      value: sseConnected ? "Live" : "Offline",
      icon: sseConnected ? "\u{1F7E2}" : "\u{1F534}",
      color: sseConnected ? "var(--success)" : "var(--danger)",
    },
  ];

  return (
    <div className="overview-cards">
      {cards.map((card) => (
        <div key={card.label} className="overview-card">
          <div className="card-icon" style={{ color: card.color }}>
            {card.icon}
          </div>
          <div className="card-content">
            <span className="card-value" style={{ color: card.color }}>
              {card.value}
            </span>
            <span className="card-label">{card.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
