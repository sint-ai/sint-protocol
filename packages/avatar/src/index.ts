/**
 * @sint/avatar — SINT Protocol Avatar Layer (L5)
 *
 * Behavioral identity profiles and CSML-driven tier escalation.
 *
 * @example
 * ```ts
 * import { AvatarRegistry, CsmlEscalator, DEFAULT_CSML_THETA } from "@sint-ai/avatar";
 *
 * const registry = new AvatarRegistry();
 * const escalator = new CsmlEscalator({
 *   queryEvents: (agentId, n) => ledger.queryByAgent(agentId, n),
 *   theta: DEFAULT_CSML_THETA,
 * });
 *
 * // Wire into PolicyGateway:
 * const gateway = new PolicyGateway({
 *   resolveToken,
 *   csmlEscalation: escalator,
 * });
 * ```
 */

export { AvatarRegistry, DEFAULT_CSML_THETA } from "./avatar-registry.js";
export { CsmlEscalator } from "./csml-escalator.js";
export type {
  AvatarProfile,
  AgentPersona,
  CsmlSnapshot,
  CsmlEscalationDecision,
  AgentEventQuery,
} from "./types.js";
