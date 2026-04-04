/**
 * @sint/bridge-swarm — SINT Protocol Swarm Coordination Bridge
 *
 * Collective constraint enforcement for multi-agent physical systems.
 * Addresses the emergent-behavior security gap that per-agent tokens cannot cover.
 *
 * Key insight: N agents each obeying their individual constraints can collectively
 * produce dangerous emergent behavior (convergence, encirclement, cascade).
 * SwarmCoordinator is the choke point for collective authorization.
 *
 * @example
 * ```ts
 * import { SwarmCoordinator } from "@sint/bridge-swarm";
 *
 * const coordinator = new SwarmCoordinator({
 *   agentGateways: new Map([
 *     ["drone-01", gateway1],
 *     ["drone-02", gateway2],
 *   ]),
 *   swarmConstraints: {
 *     maxConcurrentActors: 3,
 *     minInterAgentDistanceM: 5.0,
 *     maxCollectiveKineticEnergyJ: 500,
 *     maxEscalatedFraction: 0.2,
 *   },
 * });
 * ```
 */

export { SwarmCoordinator } from "./swarm-coordinator.js";
export type {
  SwarmConstraints,
  SwarmAgentState,
  SwarmConstraintResult,
} from "./swarm-types.js";
export type { SwarmCoordinatorConfig } from "./swarm-coordinator.js";
