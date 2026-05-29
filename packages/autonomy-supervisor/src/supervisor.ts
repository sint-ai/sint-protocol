/**
 * SINT Protocol — AutonomySupervisor (pre-gate).
 *
 * Runs BEFORE PolicyGateway.intercept(). Adds the authority axis. Composed rule:
 *   external action <=> AutonomyState == STABLE && token valid && constraints pass
 *                     && tier satisfied && guard profile passes && ledger write succeeds
 *
 * Drift is read externally (gateway/ledger), never self-reported by the agent.
 *
 * @module @pshkv/autonomy-supervisor
 */
import {
  AutonomyState, GuardState, TRANSITIONS, outputAllowed, Transition,
} from "./autonomy-states.js";

export type AutonomyDecision =
  | "retain_authority" | "suspend_authority" | "request_assistance" | "revoke_authority";

export interface AutonomyEvaluation {
  readonly agentId: string;
  readonly requestId: string;
  readonly previousState: AutonomyState;
  readonly nextState: AutonomyState;
  readonly decision: AutonomyDecision;
  readonly firedTransition: Transition["name"] | null;
  readonly outputPermitted: boolean;
  readonly reason: string;
  readonly timestamp: string;
}

const DECISION_BY_STATE: Record<AutonomyState, AutonomyDecision> = {
  [AutonomyState.STABLE]: "retain_authority",
  [AutonomyState.METACOGNITIVE]: "suspend_authority",
  [AutonomyState.ASSISTED]: "request_assistance",
  [AutonomyState.REGULATED]: "revoke_authority",
};

export interface SupervisorPort {
  getState(agentId: string): AutonomyState;
  setState(agentId: string, s: AutonomyState): void;
  /** Append an autonomy.* event to the Evidence Ledger BEFORE the action decision (I-A5). */
  ledger(ev: AutonomyEvaluation): void;
}

export function evaluateAutonomy(
  agentId: string, requestId: string, g: GuardState, port: SupervisorPort,
): AutonomyEvaluation {
  const previousState = port.getState(agentId);
  // Priority: governance > escalation > recovery. Guarantees deterministic successor.
  const order: Transition["name"][] = ["t_SR","t_MR","t_AR","t_SM","t_MA","t_AS","t_MS","t_RS"];
  let fired: Transition | null = null;
  for (const name of order) {
    const t = TRANSITIONS.find((x) => x.name === name && x.from === previousState);
    if (t && t.guard(g)) { fired = t; break; }
  }
  const nextState = fired ? fired.to : previousState;
  const evaluation: AutonomyEvaluation = {
    agentId, requestId, previousState, nextState,
    decision: DECISION_BY_STATE[nextState],
    firedTransition: fired ? fired.name : null,
    outputPermitted: outputAllowed(nextState, g),
    reason: fired ? `${fired.name}: ${previousState} -> ${nextState}` : `no transition; remained ${previousState}`,
    timestamp: new Date().toISOString(),
  };
  port.ledger(evaluation);
  if (nextState !== previousState) port.setState(agentId, nextState);
  return evaluation;
}
