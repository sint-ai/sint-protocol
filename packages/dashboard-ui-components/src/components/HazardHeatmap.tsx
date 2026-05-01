import React from 'react';

export interface HazardHeatmapProps {
  riskZones: Map<string, number>;
  onCellClick?: (row: number, col: number) => void;
}

const DIMENSIONS = ['autonomy', 'transparency', 'accountability', 'safety', 'fairness'];

export const HazardHeatmap: React.FC<HazardHeatmapProps> = ({ riskZones, onCellClick }) => {
  const cellColor = (value: number): string => {
    if (value >= 8) return '#F44336';
    if (value >= 6) return '#FF9800';
    if (value >= 4) return '#FFC107';
    if (value >= 2) return '#8BC34A';
    return '#4CAF50';
  };

  return (
    <div className="hazard-heatmap" style={{ padding: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Risk Matrix</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
        {DIMENSIONS.map((dim, col) => {
          const value = riskZones.get(dim) ?? 0;
          return (
            <div
              key={dim}
              onClick={() => onCellClick?.(0, col)}
              role={onCellClick ? 'button' : undefined}
              tabIndex={onCellClick ? 0 : undefined}
              style={{
                padding: 12,
                background: cellColor(value),
                color: '#FFF',
                textAlign: 'center',
                borderRadius: 4,
                cursor: onCellClick ? 'pointer' : 'default',
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
              <div style={{ fontSize: 10, textTransform: 'uppercase', marginTop: 4 }}>{dim}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
