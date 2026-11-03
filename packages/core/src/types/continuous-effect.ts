import type { Ed25519PublicKey, Result, UUIDv7, ISO8601 } from "./primitives.js";
import { err, ok } from "./primitives.js";

/** Stable states for a capability-backed effect that persists across requests. */
export type ContinuousEffectState =
  | "PENDING_APPROVAL"
  | "ACTIVE"
  | "SUSPENDED"
  | "ROLLEDBACK"
  | "COMPLETED";

/** Events that may change a continuous effect's execution state. */
export type ContinuousEffectEvent =
  | "approval_granted"
  | "renewed"
  | "renewal_denied"
  | "expired"
  | "revoked"
  | "stop_requested"
  | "completed";

/** Minimal state needed to correlate an active effect with its authority. */
export interface ContinuousEffectLease {
  readonly leaseId: UUIDv7;
  readonly actionRef: string;
  readonly agentId: Ed25519PublicKey;
  readonly tokenId: UUIDv7;
  readonly resource: string;
  readonly action: string;
  readonly state: ContinuousEffectState;
  readonly admittedAt: ISO8601;
  readonly renewBy: ISO8601;
  readonly expiresAt: ISO8601;
  readonly lastDecisionRef?: string;
  readonly lastReceiptRef?: string;
}

export interface ContinuousEffectTransitionError {
  readonly code: "INVALID_TRANSITION";
  readonly state: ContinuousEffectState;
  readonly event: ContinuousEffectEvent;
}

const TERMINAL_STATES = new Set<ContinuousEffectState>([
  "ROLLEDBACK",
  "COMPLETED",
]);

/**
 * Apply a lifecycle event without making an authorization decision.
 *
 * Callers MUST obtain admission and renewal decisions through
 * `PolicyGateway.intercept()` before applying `approval_granted` or `renewed`.
 * Invalid transitions fail closed and leave the lease unchanged.
 */
export function transitionContinuousEffect(
  lease: ContinuousEffectLease,
  event: ContinuousEffectEvent,
): Result<ContinuousEffectLease, ContinuousEffectTransitionError> {
  if (TERMINAL_STATES.has(lease.state)) {
    return err({ code: "INVALID_TRANSITION", state: lease.state, event });
  }

  const nextState = nextStateFor(lease.state, event);
  if (!nextState) {
    return err({ code: "INVALID_TRANSITION", state: lease.state, event });
  }

  return ok({ ...lease, state: nextState });
}

function nextStateFor(
  state: ContinuousEffectState,
  event: ContinuousEffectEvent,
): ContinuousEffectState | undefined {
  if (event === "stop_requested") return "ROLLEDBACK";
  if (event === "expired" || event === "revoked" || event === "renewal_denied") {
    return state === "PENDING_APPROVAL" || state === "ACTIVE" ? "SUSPENDED" : undefined;
  }
  if (state === "PENDING_APPROVAL" && event === "approval_granted") return "ACTIVE";
  if (state === "ACTIVE" && event === "renewed") return "ACTIVE";
  if (state === "ACTIVE" && event === "completed") return "COMPLETED";
  return undefined;
}
