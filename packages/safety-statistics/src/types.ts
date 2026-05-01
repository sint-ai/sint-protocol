/**
 * Statistical safety metrics types.
 * Inspired by Applied Intuition's "how many nines of reliability" approach.
 */

export interface FailureEvent {
  timestamp: number; // ms since epoch
  agentId: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  resolved: boolean;
  resolutionTimeMs?: number;
}

export interface ReliabilityMetrics {
  /** Mean time between failures in hours */
  mtbfHours: number;
  /** Mean time to recovery in minutes */
  mttrMinutes: number;
  /** Reliability decimal: 0.999, 0.9999 etc. */
  availability: number;
  /** Number of nines of reliability (e.g. 3 = 99.9%) */
  nines: number;
  /** Tier label */
  tier: ReliabilityTier;
}

export type ReliabilityTier =
  | 'experimental' // < 99%
  | 'beta'         // 99% - 99.9%
  | 'production'   // 99.9% - 99.99%
  | 'critical'     // 99.99% - 99.999%
  | 'safety';      // >= 99.999%

export interface ErrorBudget {
  /** Total allowed downtime (minutes) for the period */
  budgetMinutes: number;
  /** Consumed downtime (minutes) */
  consumedMinutes: number;
  /** Remaining downtime (minutes) */
  remainingMinutes: number;
  /** Burn rate: consumed / elapsed period */
  burnRate: number;
  /** True when burn rate exceeds 1.0 (overspending) */
  isOverBudget: boolean;
}

export interface IncidentAggregate {
  totalIncidents: number;
  byCategory: Record<string, number>;
  bySeverity: Record<FailureEvent['severity'], number>;
  /** Statistical noise vs program-killer */
  programKillers: number;
  noise: number;
}
