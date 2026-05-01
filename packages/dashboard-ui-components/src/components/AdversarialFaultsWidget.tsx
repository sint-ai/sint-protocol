import React from 'react';

export interface AdversarialFaultReport {
  totalRuns: number;
  faultsFound: number;
  faultRate: number;
  byCategory: Record<'prompt_mutation' | 'fault_injection' | 'edge_case' | 'red_team', { runs: number; faults: number }>;
}

export interface AdversarialFaultsWidgetProps {
  report: AdversarialFaultReport;
}

const CATEGORY_COLORS: Record<keyof AdversarialFaultReport['byCategory'], string> = {
  prompt_mutation: '#9C27B0',
  fault_injection: '#F44336',
  edge_case: '#FF9800',
  red_team: '#673AB7',
};

export const AdversarialFaultsWidget: React.FC<AdversarialFaultsWidgetProps> = ({ report }) => {
  const ratePct = (report.faultRate * 100).toFixed(1);
  return (
    <div className="adversarial-faults" style={{ padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Adversarial Test Results</span>
        <span style={{ fontSize: 12 }}>
          <strong>
            {report.faultsFound}/{report.totalRuns}
          </strong>{' '}
          · <span style={{ color: report.faultRate > 0.05 ? '#F44336' : '#4CAF50' }}>{ratePct}%</span>
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {(Object.entries(report.byCategory) as Array<[keyof AdversarialFaultReport['byCategory'], { runs: number; faults: number }]>).map(([cat, stats]) => {
          const pct = stats.runs > 0 ? (stats.faults / stats.runs) * 100 : 0;
          return (
            <div
              key={cat}
              style={{
                padding: 6,
                background: '#FAFAFA',
                borderRadius: 4,
                borderLeft: `3px solid ${CATEGORY_COLORS[cat]}`,
              }}
            >
              <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase' }}>{cat.replace('_', ' ')}</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {stats.faults}/{stats.runs}
                <span style={{ fontSize: 11, color: '#666', marginLeft: 4 }}>({pct.toFixed(0)}%)</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
