import type { AdversarialEvent, DecisionTrace } from './types.js';

/**
 * Injects synthetic adversarial events into a recorded decision trace.
 */
export class AdversarialInjector {
  static inject(trace: DecisionTrace[], events: AdversarialEvent[]): DecisionTrace[] {
    const out: DecisionTrace[] = [];
    const sorted = [...events].sort((a, b) => a.insertAfterDecision - b.insertAfterDecision);
    let nextEventIdx = 0;

    for (let i = 0; i < trace.length; i++) {
      const cur = trace[i];
      if (!cur) continue;
      out.push(cur);
      while (nextEventIdx < sorted.length) {
        const ev = sorted[nextEventIdx];
        if (!ev || ev.insertAfterDecision !== i) break;
        out.push(this.eventToTrace(ev, cur));
        nextEventIdx++;
      }
    }
    return out;
  }

  private static eventToTrace(event: AdversarialEvent, prev: DecisionTrace): DecisionTrace {
    const base: DecisionTrace = {
      id: `adv-${event.type}-${prev.id}`,
      timestamp: prev.timestamp + 1,
      agentId: prev.agentId,
      observation: { adversarial: true, type: event.type, ...event.payload },
      action: { error: event.type },
      latencyMs: event.type === 'latency_spike' ? 5000 : prev.latencyMs,
    };
    return base;
  }

  /** Generate a default adversarial battery covering all event types. */
  static defaultBattery(traceLength: number): AdversarialEvent[] {
    const points = [
      Math.floor(traceLength * 0.25),
      Math.floor(traceLength * 0.5),
      Math.floor(traceLength * 0.75),
    ];
    const types: AdversarialEvent['type'][] = [
      'mcp_timeout',
      'malformed_response',
      'latency_spike',
      'state_corruption',
      'sensor_dropout',
    ];
    return types.map((t, i) => ({
      type: t,
      insertAfterDecision: points[i % points.length] ?? 0,
    }));
  }
}
