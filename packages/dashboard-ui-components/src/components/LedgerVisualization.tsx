import React from 'react';

export interface LedgerEntry {
  index: number;
  hash: string;
  previousHash: string;
  timestamp: number;
  agentId: string;
  decision: string;
}

export interface LedgerVisualizationProps {
  entries: LedgerEntry[];
  isIntact: boolean;
  onEntryClick?: (entry: LedgerEntry) => void;
}

export const LedgerVisualization: React.FC<LedgerVisualizationProps> = ({ entries, isIntact, onEntryClick }) => {
  return (
    <div className="ledger-visualization" style={{ padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Evidence Ledger</span>
        <span style={{ fontSize: 11, color: isIntact ? '#4CAF50' : '#F44336' }}>
          {isIntact ? '✓ intact' : '⚠ tampered'}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {entries.slice(0, 8).map((e) => (
          <div
            key={e.index}
            onClick={() => onEntryClick?.(e)}
            role={onEntryClick ? 'button' : undefined}
            tabIndex={onEntryClick ? 0 : undefined}
            style={{
              padding: '6px 8px',
              background: '#FAFAFA',
              borderRadius: 4,
              borderLeft: '3px solid #2196F3',
              fontSize: 11,
              cursor: onEntryClick ? 'pointer' : 'default',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <strong>#{e.index}</strong>
              <span style={{ color: '#999' }}>{new Date(e.timestamp).toLocaleString()}</span>
            </div>
            <div style={{ color: '#666' }}>
              {e.agentId} · {e.decision}
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 9, color: '#999' }}>{e.hash.slice(0, 30)}…</div>
          </div>
        ))}
      </div>
    </div>
  );
};
