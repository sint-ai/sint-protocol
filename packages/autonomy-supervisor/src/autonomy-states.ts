/**
 * SINT Protocol — Autonomy State Machine (managed-autonomy layer).
 *
 * Four-mode autonomy lifecycle (S/M/A/Rt) as a single mode-token model:
 * exactly one authority token resides in {S, M, A, Rt} at all times.
 * Orthogonal to consequence tiers (T0-T3). External actuation reachable ONLY from S.
 *
 * @module @pshkv/autonomy-supervisor/states
 */

export const AutonomyState = {
  STABLE: "stable",
  METACOGNITIVE: "metacognitive_recovery",
  ASSISTED: "assisted_recovery",
  REGULATED: "regulated_control",
} as const;

export type AutonomyState = (typeof AutonomyState)[keyof typeof AutonomyState];
export const ALL_STATES: readonly AutonomyState[] = Object.values(AutonomyState);

export interface GuardState {
  /** invalid(sigma): epistemic invalidity (uncertainty/anomaly/missing evidence). CSML feeds this. */
  readonly invalid: boolean;
  /** UR(sigma): unsafe/unrecoverable (safety breach, hardware fault). */
  readonly unsafeUnrecoverable: boolean;
  /** disagree(sigma): unresolved multi-agent disagreement (blocks A->S). */
  readonly disagree: boolean;
  /** assist(sigma): external assistance is available (gates M->A vs M->Rt). */
  readonly assistAvailable: boolean;
  /** timeoutM(sigma): M recovery budget exhausted. */
  readonly timeoutM: boolean;
  /** timeoutA(sigma): A consensus budget exhausted. */
  readonly timeoutA: boolean;
  /** extauth(sigma): EXTERNAL authorization to exit Rt. MUST be sourced outside the supervisor (I-A6). */
  readonly extAuth: boolean;
}

export type TransitionName =
  | "t_SM" | "t_SR"
  | "t_MS" | "t_MA" | "t_MR"
  | "t_AS" | "t_AR"
  | "t_RS";

export interface Transition {
  readonly name: TransitionName;
  readonly from: AutonomyState;
  readonly to: AutonomyState;
  /** Strong-timed escalation/governance transitions cannot be postponed (non-Zeno). */
  readonly strongTimed: boolean;
  readonly guard: (g: GuardState) => boolean;
}

export const TRANSITIONS: readonly Transition[] = [
  // From S
  { name: "t_SM", from: AutonomyState.STABLE, to: AutonomyState.METACOGNITIVE,
    strongTimed: true, guard: (g) => g.invalid && !g.unsafeUnrecoverable },
  { name: "t_SR", from: AutonomyState.STABLE, to: AutonomyState.REGULATED,
    strongTimed: true, guard: (g) => g.unsafeUnrecoverable },

  // From M
  { name: "t_MS", from: AutonomyState.METACOGNITIVE, to: AutonomyState.STABLE,
    strongTimed: false, guard: (g) => !g.invalid && !g.unsafeUnrecoverable },
  { name: "t_MA", from: AutonomyState.METACOGNITIVE, to: AutonomyState.ASSISTED,
    strongTimed: true, guard: (g) => g.invalid && g.timeoutM && !g.unsafeUnrecoverable && g.assistAvailable },
  { name: "t_MR", from: AutonomyState.METACOGNITIVE, to: AutonomyState.REGULATED,
    strongTimed: true, guard: (g) => g.unsafeUnrecoverable || (g.invalid && g.timeoutM && !g.assistAvailable) },

  // From A
  { name: "t_AS", from: AutonomyState.ASSISTED, to: AutonomyState.STABLE,
    strongTimed: false, guard: (g) => !g.disagree && !g.invalid && !g.unsafeUnrecoverable },
  { name: "t_AR", from: AutonomyState.ASSISTED, to: AutonomyState.REGULATED,
    strongTimed: true,
    // Generalized liveness: any persistent unresolved condition (disagree OR residual invalid)
    // past the A-budget forces governance. Closes the "stuck in A" gap. DO NOT narrow this back to disagree-only.
    guard: (g) => g.unsafeUnrecoverable || (g.timeoutA && (g.disagree || g.invalid)) },

  // From Rt — ABSORBING absent external authorization (I-A6)
  { name: "t_RS", from: AutonomyState.REGULATED, to: AutonomyState.STABLE,
    strongTimed: false, guard: (g) => g.extAuth && !g.unsafeUnrecoverable && !g.invalid },
];

/** Output transitions are structurally gated on S (+ recommended guard strengthening). */
export function outputAllowed(state: AutonomyState, g: GuardState): boolean {
  return state === AutonomyState.STABLE && !g.invalid && !g.unsafeUnrecoverable;
}
