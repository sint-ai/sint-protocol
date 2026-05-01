import React from 'react';

export interface ApprovalState {
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  approvals: number;
  threshold: number;
  timestamp: number;
}

export interface ApprovalFlowProps {
  state: ApprovalState;
  onStateChange?: (newState: ApprovalState) => void;
}

const STATUS_COLORS: Record<ApprovalState['status'], string> = {
  pending: '#FFC107',
  approved: '#4CAF50',
  rejected: '#F44336',
  executed: '#2196F3',
};

export const ApprovalFlow: React.FC<ApprovalFlowProps> = ({ state, onStateChange }) => {
  const pct = state.threshold > 0 ? Math.min(100, (state.approvals / state.threshold) * 100) : 0;
  const color = STATUS_COLORS[state.status];

  const handleApprove = () => {
    onStateChange?.({ ...state, approvals: state.approvals + 1 });
  };

  return (
    <div className="approval-flow" style={{ padding: 12 }}>
      <div className="approval-status" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Approval</span>
        <span
          style={{
            padding: '4px 10px',
            borderRadius: 4,
            fontSize: 11,
            color: '#FFF',
            background: color,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
          }}
        >
          {state.status}
        </span>
      </div>
      <div className="approval-progress" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
          <span>
            {state.approvals} / {state.threshold} approvals
          </span>
          <span>{pct.toFixed(0)}%</span>
        </div>
        <div style={{ width: '100%', height: 8, background: '#EEE', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.3s' }} />
        </div>
      </div>
      <div className="approval-meta" style={{ marginTop: 8, fontSize: 11, color: '#999' }}>
        Last update: {new Date(state.timestamp).toLocaleString()}
      </div>
      {state.status === 'pending' && onStateChange && (
        <button
          onClick={handleApprove}
          style={{ marginTop: 12, padding: '6px 12px', borderRadius: 4, background: STATUS_COLORS.approved, color: '#FFF', border: 'none', cursor: 'pointer' }}
        >
          Approve
        </button>
      )}
    </div>
  );
};
