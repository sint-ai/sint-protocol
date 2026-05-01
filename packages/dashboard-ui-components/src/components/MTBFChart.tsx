import React from 'react';

export interface MTBFDataPoint {
  timestamp: number;
  mtbfHours: number;
}

export interface MTBFChartProps {
  dataPoints: MTBFDataPoint[];
  errorBudgetMinutes: number;
  consumedMinutes: number;
}

export const MTBFChart: React.FC<MTBFChartProps> = ({ dataPoints, errorBudgetMinutes, consumedMinutes }) => {
  const max = Math.max(1, ...dataPoints.map((p) => p.mtbfHours));
  const width = 320;
  const height = 120;
  const burnPct = errorBudgetMinutes > 0 ? Math.min(100, (consumedMinutes / errorBudgetMinutes) * 100) : 0;
  const burnColor = burnPct > 80 ? '#F44336' : burnPct > 50 ? '#FF9800' : '#4CAF50';

  return (
    <div className="mtbf-chart" style={{ padding: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Mean Time Between Failures (hours)</div>
      <svg width={width} height={height} style={{ background: '#FAFAFA', borderRadius: 4 }}>
        {dataPoints.map((p, i) => {
          const x = (i / Math.max(1, dataPoints.length - 1)) * (width - 20) + 10;
          const y = height - (p.mtbfHours / max) * (height - 20) - 10;
          const next = dataPoints[i + 1];
          if (!next) return <circle key={i} cx={x} cy={y} r={3} fill="#2196F3" />;
          const x2 = ((i + 1) / Math.max(1, dataPoints.length - 1)) * (width - 20) + 10;
          const y2 = height - (next.mtbfHours / max) * (height - 20) - 10;
          return (
            <g key={i}>
              <line x1={x} y1={y} x2={x2} y2={y2} stroke="#2196F3" strokeWidth={2} />
              <circle cx={x} cy={y} r={3} fill="#2196F3" />
            </g>
          );
        })}
      </svg>
      <div style={{ marginTop: 12, fontSize: 12 }}>
        <div style={{ marginBottom: 4 }}>
          Error budget burn: <strong style={{ color: burnColor }}>{burnPct.toFixed(1)}%</strong>
        </div>
        <div style={{ width: '100%', height: 8, background: '#EEE', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${burnPct}%`, height: '100%', background: burnColor, transition: 'width 0.3s' }} />
        </div>
      </div>
    </div>
  );
};
