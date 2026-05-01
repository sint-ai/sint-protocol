import React, { useMemo } from 'react';
import type { Incident } from '../hooks/useDRRData.js';

export interface DRRTimelineProps {
  incidents: Incident[];
  timelineStart: number;
  timelineEnd: number;
  onIncidentClick?: (incident: Incident, index: number) => void;
}

const SEVERITY_COLORS: Record<Incident['severity'], string> = {
  low: '#4CAF50',
  medium: '#FFC107',
  high: '#FF9800',
  critical: '#F44336',
};

export const DRRTimeline: React.FC<DRRTimelineProps> = ({
  incidents,
  timelineStart,
  timelineEnd,
  onIncidentClick,
}) => {
  const timeline = useMemo(() => {
    const range = Math.max(1, timelineEnd - timelineStart);
    return incidents.map((incident, index) => {
      const percentage = ((incident.timestamp - timelineStart) / range) * 100;
      return (
        <div
          key={index}
          className="timeline-incident"
          style={{
            left: `${percentage}%`,
            backgroundColor: SEVERITY_COLORS[incident.severity],
            opacity: incident.mitigated ? 0.5 : 1,
          }}
          onClick={() => onIncidentClick?.(incident, index)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onIncidentClick?.(incident, index);
          }}
        >
          <div className="tooltip">{incident.description}</div>
        </div>
      );
    });
  }, [incidents, timelineStart, timelineEnd, onIncidentClick]);

  const formatTime = (ts: number) => new Date(ts).toLocaleDateString();

  return (
    <div className="drr-timeline">
      <div className="timeline-header">
        <span className="timeline-label">DRR Timeline</span>
        <span className="time-range">
          {formatTime(timelineStart)} to {formatTime(timelineEnd)}
        </span>
      </div>
      <div className="timeline-track">
        <div className="timeline-incidents">{timeline}</div>
      </div>
      <div className="timeline-legend">
        {(Object.keys(SEVERITY_COLORS) as Array<keyof typeof SEVERITY_COLORS>).map((sev) => (
          <div key={sev} className="legend-item">
            <span className="legend-color" style={{ backgroundColor: SEVERITY_COLORS[sev] }} />
            {sev.charAt(0).toUpperCase() + sev.slice(1)}
          </div>
        ))}
      </div>
      <div className="timeline-stats">
        <div className="stat-item">
          Total Incidents: <strong>{incidents.length}</strong>
        </div>
        <div className="stat-item">
          Mitigated: <strong>{incidents.filter((i) => i.mitigated).length}</strong>
        </div>
        <div className="stat-item">
          Critical: <strong>{incidents.filter((i) => i.severity === 'critical').length}</strong>
        </div>
      </div>
    </div>
  );
};
