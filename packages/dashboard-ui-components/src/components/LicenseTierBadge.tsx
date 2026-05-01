import React from 'react';

export type LicenseTier = 'core_os' | 'autonomy_stack' | 'dev_tooling' | 'compliance_pack' | 'enterprise';

export interface LicenseTierBadgeProps {
  tiers: LicenseTier[];
  daysUntilExpiry: number;
  customerId: string;
}

const TIER_COLORS: Record<LicenseTier, string> = {
  core_os: '#607D8B',
  autonomy_stack: '#3F51B5',
  dev_tooling: '#009688',
  compliance_pack: '#7B1FA2',
  enterprise: '#FF6F00',
};

export const LicenseTierBadge: React.FC<LicenseTierBadgeProps> = ({ tiers, daysUntilExpiry, customerId }) => {
  const expiringSoon = daysUntilExpiry < 30 && daysUntilExpiry >= 0;
  const expired = daysUntilExpiry < 0;
  return (
    <div className="license-tier-badge" style={{ padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>License</span>
        <span style={{ fontSize: 11, color: '#999' }}>{customerId}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {tiers.map((tier) => (
          <span
            key={tier}
            style={{
              padding: '4px 8px',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              color: '#FFF',
              background: TIER_COLORS[tier],
              letterSpacing: 0.5,
            }}
          >
            {tier.replace('_', ' ')}
          </span>
        ))}
      </div>
      <div style={{ fontSize: 11, color: expired ? '#F44336' : expiringSoon ? '#FF9800' : '#4CAF50' }}>
        {expired ? '⚠ Expired' : expiringSoon ? '⚠ Expires in ' : 'Valid for '}
        {!expired && (
          <strong>
            {daysUntilExpiry} days
          </strong>
        )}
      </div>
    </div>
  );
};
