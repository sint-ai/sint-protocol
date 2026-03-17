/**
 * SINT Dashboard — Tier Legend Component.
 *
 * Shows the four SINT approval tiers with explanations.
 */

interface TierInfo {
  name: string;
  label: string;
  description: string;
  color: string;
  autoApproved: boolean;
}

const TIERS: TierInfo[] = [
  {
    name: "T0",
    label: "OBSERVE",
    description: "Read-only observation. Auto-approved, logged.",
    color: "var(--tier-0)",
    autoApproved: true,
  },
  {
    name: "T1",
    label: "PREPARE",
    description: "Safe writes and preparations. Auto-approved, audited.",
    color: "var(--tier-1)",
    autoApproved: true,
  },
  {
    name: "T2",
    label: "ACT",
    description: "State-changing actions. Requires review.",
    color: "var(--tier-2)",
    autoApproved: false,
  },
  {
    name: "T3",
    label: "COMMIT",
    description: "Irreversible / financial. Requires human approval.",
    color: "var(--tier-3)",
    autoApproved: false,
  },
];

export function TierLegend() {
  return (
    <section className="panel tier-legend">
      <h2 className="panel-title">Approval Tiers</h2>
      <div className="tier-list">
        {TIERS.map((tier) => (
          <div key={tier.name} className="tier-item">
            <div className="tier-indicator" style={{ background: tier.color }}>
              {tier.name}
            </div>
            <div className="tier-info">
              <span className="tier-name">{tier.label}</span>
              <span className="tier-desc">{tier.description}</span>
            </div>
            <span className={`tier-auto ${tier.autoApproved ? "auto-yes" : "auto-no"}`}>
              {tier.autoApproved ? "Auto" : "Manual"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
