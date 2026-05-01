import type { FailureEvent, IncidentAggregate } from './types.js';

/**
 * Aggregates incidents to distinguish "statistical noise" from "program killers".
 * Inspired by Applied Intuition's stance: a single crash shouldn't kill a program
 * if broader safety metrics improve.
 */
export class IncidentAggregator {
  /** Aggregate failure events. */
  static aggregate(failures: FailureEvent[]): IncidentAggregate {
    const byCategory: Record<string, number> = {};
    const bySeverity: Record<FailureEvent['severity'], number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };
    let programKillers = 0;
    let noise = 0;

    for (const f of failures) {
      byCategory[f.category] = (byCategory[f.category] ?? 0) + 1;
      bySeverity[f.severity]++;
      if (this.isProgramKiller(f)) {
        programKillers++;
      } else {
        noise++;
      }
    }

    return {
      totalIncidents: failures.length,
      byCategory,
      bySeverity,
      programKillers,
      noise,
    };
  }

  /**
   * A "program killer" is a critical incident that was not resolved within 24h,
   * or any incident category that recurs 3+ times in the window.
   */
  static isProgramKiller(f: FailureEvent): boolean {
    if (f.severity === 'critical' && (!f.resolved || (f.resolutionTimeMs ?? 0) > 24 * 60 * 60 * 1000)) {
      return true;
    }
    return false;
  }

  /** Compute the incidents-per-million-decisions rate. */
  static rate(failures: FailureEvent[], totalDecisions: number): number {
    if (totalDecisions === 0) return 0;
    return (failures.length / totalDecisions) * 1_000_000;
  }
}
