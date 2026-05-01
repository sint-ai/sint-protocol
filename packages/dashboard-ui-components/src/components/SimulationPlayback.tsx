import React, { useState } from 'react';

export interface SimDecisionTrace {
  id: string;
  timestamp: number;
  agentId: string;
  observation: Record<string, unknown>;
  action: Record<string, unknown>;
  latencyMs: number;
}

export interface SimDivergence {
  decisionIndex: number;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  severity: 'minor' | 'major';
}

export interface SimulationPlaybackProps {
  trace: SimDecisionTrace[];
  divergences: SimDivergence[];
  onScrub?: (index: number) => void;
}

export const SimulationPlayback: React.FC<SimulationPlaybackProps> = ({ trace, divergences, onScrub }) => {
  const [idx, setIdx] = useState(0);
  const cur = trace[idx];
  const divergenceIdxs = new Set(divergences.map((d) => d.decisionIndex));

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseInt(e.target.value, 10);
    setIdx(v);
    onScrub?.(v);
  };

  return (
    <div className="simulation-playback" style={{ padding: 12 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Simulation Replay</div>
      <div style={{ fontSize: 12, marginBottom: 8 }}>
        Step <strong>{idx + 1}</strong> / {trace.length}
        {divergenceIdxs.has(idx) && <span style={{ marginLeft: 8, color: '#F44336' }}>⚠ divergence</span>}
      </div>
      {cur && (
        <div style={{ background: '#FAFAFA', padding: 8, borderRadius: 4, fontSize: 11, fontFamily: 'monospace', marginBottom: 8 }}>
          <div>agent: {cur.agentId}</div>
          <div>action: {JSON.stringify(cur.action)}</div>
          <div>latency: {cur.latencyMs}ms</div>
        </div>
      )}
      <input
        type="range"
        min={0}
        max={Math.max(0, trace.length - 1)}
        value={idx}
        onChange={handleChange}
        style={{ width: '100%' }}
      />
      <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
        Total divergences: <strong>{divergences.length}</strong> of {trace.length}
      </div>
    </div>
  );
};
