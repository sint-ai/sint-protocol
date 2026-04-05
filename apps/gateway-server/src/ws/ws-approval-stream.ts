/**
 * SINT Gateway Server — Approval Event Bus.
 *
 * In-process event bus for real-time T2/T3 approval and decision events.
 * Shared between the intercept route (publisher) and the WebSocket transport
 * (subscriber), following the same pattern as RiskScoreBus.
 *
 * Two event types are emitted:
 *  - APPROVAL_REQUIRED: a request has been escalated and needs human review.
 *  - DECISION: a T2+ PolicyGateway decision (allow, deny, or escalate).
 *
 * @module @sint/gateway-server/ws/ws-approval-stream
 */

/** An escalation event requiring human review. */
export interface ApprovalRequiredEvent {
  readonly type: "APPROVAL_REQUIRED";
  readonly requestId: string;
  readonly agentId: string;
  readonly resource: string;
  readonly action: string;
  /** The tier that triggered escalation (T2_ACT or T3_COMMIT). */
  readonly tier: string;
  readonly timestamp: string;
}

/** A gateway decision event for any T2+ request. */
export interface DecisionEvent {
  readonly type: "DECISION";
  readonly requestId: string;
  readonly agentId: string;
  readonly resource: string;
  readonly action: string;
  /** The assigned approval tier (T2_ACT or T3_COMMIT). */
  readonly tier: string;
  /** The gateway decision: allow | deny | escalate | transform. */
  readonly decision: string;
  readonly timestamp: string;
}

export type ApprovalStreamEvent = ApprovalRequiredEvent | DecisionEvent;
export type ApprovalStreamEventWithSequence = ApprovalStreamEvent & { readonly sequence: number };

/**
 * In-process event bus for approval stream events.
 *
 * Publishers (intercept route) call `emit()`.
 * Subscribers (WS transport) call `on()` and receive an unsubscribe function.
 */
export class ApprovalEventBus {
  private readonly listeners: Set<(event: ApprovalStreamEvent) => void> = new Set();
  private readonly history: ApprovalStreamEventWithSequence[] = [];
  private sequenceCounter = 0;

  constructor(private readonly maxHistorySize = 500) {}

  /** Subscribe to approval stream events. Returns an unsubscribe function. */
  on(listener: (event: ApprovalStreamEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Emit an event to all current subscribers. Never throws. */
  emit(event: ApprovalStreamEvent): void {
    const sequenced: ApprovalStreamEventWithSequence = {
      ...event,
      sequence: ++this.sequenceCounter,
    };
    this.history.push(sequenced);
    if (this.history.length > this.maxHistorySize) {
      this.history.splice(0, this.history.length - this.maxHistorySize);
    }

    for (const listener of this.listeners) {
      try {
        listener(sequenced);
      } catch {
        // Never let a listener crash the publisher
      }
    }
  }

  /** Replay historical events after an exclusive sequence cursor. */
  replayAfter(sequence: number, limit = 200): ApprovalStreamEventWithSequence[] {
    if (this.history.length === 0) return [];
    const bounded = Math.max(1, Math.min(limit, this.maxHistorySize));
    const filtered = this.history.filter((event) => event.sequence > sequence);
    return filtered.slice(-bounded);
  }

  /** Replay historical events after an ISO timestamp (exclusive). */
  replayAfterTimestamp(timestampIso: string, limit = 200): ApprovalStreamEventWithSequence[] {
    const ts = Date.parse(timestampIso);
    if (!Number.isFinite(ts) || this.history.length === 0) return [];
    const bounded = Math.max(1, Math.min(limit, this.maxHistorySize));
    const filtered = this.history.filter((event) => Date.parse(event.timestamp) > ts);
    return filtered.slice(-bounded);
  }

  /** Number of active subscribers (useful for testing). */
  get subscriberCount(): number {
    return this.listeners.size;
  }
}

/** Create a fresh ApprovalEventBus instance. */
export function createApprovalEventBus(): ApprovalEventBus {
  return new ApprovalEventBus();
}

/** Singleton bus — used by the gateway server in production. */
export const globalApprovalBus = new ApprovalEventBus();

/** Convenience wrapper: broadcast to the singleton globalApprovalBus. */
export function broadcastApprovalEvent(event: ApprovalStreamEvent): void {
  globalApprovalBus.emit(event);
}
