import { useState, useCallback } from 'react';

export interface Incident {
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  mitigated: boolean;
}

export interface DRRData {
  incidents: Incident[];
  timelineStart: number;
  timelineEnd: number;
  mitigationRate: number;
  riskZones: Map<string, number>;
}

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

export function useDRRData() {
  const [data, setData] = useState<DRRData>({
    incidents: [],
    timelineStart: Date.now() - SEVEN_DAYS,
    timelineEnd: Date.now(),
    mitigationRate: 0,
    riskZones: new Map(),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchDRRData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Placeholder — consumers wire this up to their API.
      setData((prev) => ({ ...prev }));
    } catch (e) {
      setError(e instanceof Error ? e : new Error('fetch failed'));
    } finally {
      setLoading(false);
    }
  }, []);

  const addIncident = useCallback((incident: Incident) => {
    setData((prev) => {
      const incidents = [...prev.incidents, incident];
      const mitigated = incidents.filter((i) => i.mitigated).length;
      return { ...prev, incidents, mitigationRate: mitigated / incidents.length };
    });
  }, []);

  const updateMitigationStatus = useCallback((index: number, mitigated: boolean) => {
    setData((prev) => {
      const incidents = prev.incidents.map((i, idx) => (idx === index ? { ...i, mitigated } : i));
      const m = incidents.filter((i) => i.mitigated).length;
      return { ...prev, incidents, mitigationRate: incidents.length > 0 ? m / incidents.length : 0 };
    });
  }, []);

  const clearIncidents = useCallback(() => {
    setData((prev) => ({ ...prev, incidents: [], mitigationRate: 0 }));
  }, []);

  return { data, loading, error, fetchDRRData, addIncident, updateMitigationStatus, clearIncidents };
}
