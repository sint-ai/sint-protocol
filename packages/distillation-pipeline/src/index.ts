/**
 * Distillation pipeline: cloud agent decisions → edge agent policy table.
 *
 * Implements Applied Intuition's pattern of using full-power cloud models
 * to generate training signal for compact edge models.
 */

export interface CloudTrace {
  observationKey: string;
  action: string;
  confidence: number;
  /** Number of times this exact (observationKey, action) pair was seen */
  count?: number;
}

export interface EdgePolicyTable {
  table: Map<string, { action: string; confidence: number }>;
  /** Number of distinct observations covered */
  coverage: number;
  /** Estimated bytes of the compiled policy */
  footprintBytes: number;
}

export interface DistillationConfig {
  /** Discard pairs seen fewer than this many times */
  minOccurrences: number;
  /** Discard pairs whose action varies (low determinism) */
  maxActionVarianceFraction: number;
  /** Hard cap on table size to keep edge footprint small */
  maxEntries: number;
}

export class DistillationPipeline {
  /** Aggregate cloud traces by observation key, taking the dominant action. */
  static aggregate(traces: CloudTrace[]): Map<string, Map<string, { count: number; sumConfidence: number }>> {
    const map = new Map<string, Map<string, { count: number; sumConfidence: number }>>();
    for (const t of traces) {
      if (!map.has(t.observationKey)) map.set(t.observationKey, new Map());
      const inner = map.get(t.observationKey)!;
      const prev = inner.get(t.action) ?? { count: 0, sumConfidence: 0 };
      inner.set(t.action, {
        count: prev.count + (t.count ?? 1),
        sumConfidence: prev.sumConfidence + t.confidence * (t.count ?? 1),
      });
    }
    return map;
  }

  /** Compile aggregated traces into an EdgePolicyTable. */
  static compile(traces: CloudTrace[], config: DistillationConfig): EdgePolicyTable {
    const aggregated = this.aggregate(traces);
    const table = new Map<string, { action: string; confidence: number }>();

    for (const [obsKey, actions] of aggregated.entries()) {
      const entries = [...actions.entries()].sort((a, b) => b[1].count - a[1].count);
      const total = entries.reduce((sum, [, v]) => sum + v.count, 0);
      const top = entries[0];
      if (!top) continue;
      const [topAction, topStats] = top;

      if (topStats.count < config.minOccurrences) continue;

      // Reject if action is too non-deterministic
      const dominantFraction = topStats.count / total;
      if (1 - dominantFraction > config.maxActionVarianceFraction) continue;

      table.set(obsKey, {
        action: topAction,
        confidence: topStats.sumConfidence / topStats.count,
      });

      if (table.size >= config.maxEntries) break;
    }

    let footprint = 0;
    for (const [k, v] of table.entries()) {
      footprint += k.length * 2 + v.action.length * 2 + 8;
    }

    return { table, coverage: table.size, footprintBytes: footprint };
  }
}
