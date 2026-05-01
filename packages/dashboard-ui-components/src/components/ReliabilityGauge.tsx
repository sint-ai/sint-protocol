import React from 'react';

export type ReliabilityTier = 'experimental' | 'beta' | 'production' | 'critical' | 'safety';

export interface ReliabilityGaugeProps {
  nines: number;
  tier: ReliabilityTier;
  mtbfHours: number;
  onTierClick?: (tier: ReliabilityTier) => void;
}

const TIER_COLORS: Record<ReliabilityTier, string> = {
  experimental: '#9E9E9E',
  beta: '#FFC107',
  production: '#4CAF50',
  critical: '#2196F3',
  safety: '#7B1FA2',
};

export const ReliabilityGauge: React.FC<ReliabilityGaugeProps> = ({ nines, tier, mtbfHours, onTierClick }) => {
  const ninesDisplay = Number.isFinite(nines) ? nines.toFixed(2) : '∞';
  const color = TIER_COLORS[tier];
  const angle = Math.min(180, (nines / 6) * 180);
  return (
    <div
      className="reliability-gauge"
      style={{ padding: 16, textAlign: 'center', cursor: onTierClick ? 'pointer' : 'default' }}
      onClick={() => onTierClick?.(tier)}
      role={onTierClick ? 'button' : undefined}
      tabIndex={onTierClick ? 0 : undefined}
    >
      <div style={{ width: 160, height: 80, position: 'relative', margin: '0 auto', overflow: 'hidden' }}>
        <div
          style={{
            width: 160,
            height: 160,
            borderRadius: '50%',
            border: `12px solid ${color}`,
            transform: `rotate(${angle - 90}deg)`,
            transformOrigin: '50% 50%',
          }}
        />
      </div>
      <div style={{ fontSize: 32, fontWeight: 700, marginTop: 8, color }}>
        {ninesDisplay}
        <span style={{ fontSize: 16, marginLeft: 4, opacity: 0.7 }}>nines</span>
      </div>
      <div style={{ fontSize: 14, textTransform: 'uppercase', letterSpacing: 1, color, marginTop: 4 }}>{tier}</div>
      <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
        MTBF: <strong>{mtbfHours.toFixed(1)}</strong> hours
      </div>
    </div>
  );
};
