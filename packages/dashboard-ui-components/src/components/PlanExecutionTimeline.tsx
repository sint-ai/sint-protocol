import React from 'react';

export interface PlanEvent {
  type: 'step_start' | 'step_complete' | 'replan_triggered' | 'plan_complete' | 'plan_failed';
  stepId?: string;
  state: Record<string, unknown>;
  reason?: string;
  timestamp: number;
}

export interface PlanExecutionTimelineProps {
  events: PlanEvent[];
  onEventClick?: (event: PlanEvent) => void;
}

const EVENT_COLORS: Record<PlanEvent['type'], string> = {
  step_start: '#2196F3',
  step_complete: '#4CAF50',
  replan_triggered: '#FF9800',
  plan_complete: '#7B1FA2',
  plan_failed: '#F44336',
};

export const PlanExecutionTimeline: React.FC<PlanExecutionTimelineProps> = ({ events, onEventClick }) => {
  const replanCount = events.filter((e) => e.type === 'replan_triggered').length;
  const success = events.some((e) => e.type === 'plan_complete');
  return (
    <div className="plan-execution-timeline" style={{ padding: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Plan Execution</span>
        <span style={{ fontSize: 12, color: success ? '#4CAF50' : '#F44336' }}>
          {replanCount} replans · {success ? '✓ done' : '⚠ failed'}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {events.slice(0, 12).map((e, i) => (
          <div
            key={i}
            onClick={() => onEventClick?.(e)}
            role={onEventClick ? 'button' : undefined}
            tabIndex={onEventClick ? 0 : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '4px 6px',
              background: '#FAFAFA',
              borderRadius: 4,
              fontSize: 11,
              cursor: onEventClick ? 'pointer' : 'default',
              borderLeft: `3px solid ${EVENT_COLORS[e.type]}`,
            }}
          >
            <span style={{ color: EVENT_COLORS[e.type], fontWeight: 600, minWidth: 100 }}>{e.type}</span>
            <span style={{ color: '#666', flex: 1 }}>{e.stepId ?? '—'}</span>
            <span style={{ color: '#999' }}>{new Date(e.timestamp).toLocaleTimeString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
