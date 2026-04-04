/**
 * SINT Protocol — Swarm Coordinator.
 *
 * Enforces collective constraints across a fleet of physical agents.
 * Works as a wrapper around individual PolicyGateway calls — every agent
 * request is first checked against swarm-level constraints, then forwarded
 * to the agent's own PolicyGateway.
 *
 * The coordinator maintains a registry of active agents and their live states.
 * It is the "narrow waist" for all multi-agent physical coordination:
 *
 *   GCS / AI Planner
 *       │
 *       ▼
 *   SwarmCoordinator.requestAction(agentId, request)
 *       │
 *       ├─ 1. Swarm constraints check (collective KE, concurrency, density)
 *       │       └─ deny if collective constraints violated
 *       │
 *       ├─ 2. Individual PolicyGateway.intercept(request)
 *       │       └─ deny if individual token/tier/constraint violated
 *       │
 *       └─ 3. Update swarm state registry
 *
 * Thread safety note: in a multi-agent deployment, requests may arrive
 * concurrently. The coordinator uses optimistic locking — it reads state,
 * checks, then updates. Under high contention, add a mutex per swarm.
 *
 * @module @sint/bridge-swarm/swarm-coordinator
 */

import { ApprovalTier } from "@sint/core";
import type { SintRequest, PolicyDecision } from "@sint/core";
import type { PolicyGateway } from "@sint/gate-policy-gateway";
import type {
  SwarmConstraints,
  SwarmAgentState,
  SwarmConstraintResult,
} from "./swarm-types.js";

const ACT_TIERS = new Set([ApprovalTier.T2_ACT, ApprovalTier.T3_COMMIT]);

/** Distance between two 3D points in NED frame (meters). */
function ned3d(
  a: { north: number; east: number; down: number },
  b: { north: number; east: number; down: number },
): number {
  return Math.sqrt(
    (a.north - b.north) ** 2 + (a.east - b.east) ** 2 + (a.down - b.down) ** 2,
  );
}

/** Collective kinetic energy: Σ(½mv²) in joules. */
function collectiveKE(states: ReadonlyMap<string, SwarmAgentState>): number {
  let total = 0;
  for (const s of states.values()) {
    if (s.velocityMps !== undefined && s.massKg !== undefined) {
      total += 0.5 * s.massKg * s.velocityMps ** 2;
    }
  }
  return total;
}

/** Minimum pairwise inter-agent distance (null if fewer than 2 agents with position). */
function minPairDistance(states: ReadonlyMap<string, SwarmAgentState>): number | null {
  const withPos = [...states.values()].filter((s) => s.position !== undefined);
  if (withPos.length < 2) return null;

  let min = Infinity;
  for (let i = 0; i < withPos.length; i++) {
    for (let j = i + 1; j < withPos.length; j++) {
      const d = ned3d(withPos[i]!.position!, withPos[j]!.position!);
      if (d < min) min = d;
    }
  }
  return min;
}

/**
 * Configuration for the SwarmCoordinator.
 */
export interface SwarmCoordinatorConfig {
  /**
   * Map from agentId to that agent's PolicyGateway.
   * Each agent may have its own gateway (with its own token store, ledger).
   * Or all agents may share a gateway — both are valid.
   */
  readonly agentGateways: ReadonlyMap<string, PolicyGateway>;

  /**
   * Collective physical constraints for the entire swarm.
   */
  readonly swarmConstraints: SwarmConstraints;
}

/**
 * Swarm Coordinator — collective constraint enforcement for multi-agent systems.
 *
 * @example
 * ```ts
 * const coordinator = new SwarmCoordinator({
 *   agentGateways: new Map([
 *     ["drone-01", gateway1],
 *     ["drone-02", gateway2],
 *   ]),
 *   swarmConstraints: {
 *     maxConcurrentActors: 2,
 *     minInterAgentDistanceM: 5.0,
 *     maxCollectiveKineticEnergyJ: 500,
 *   },
 * });
 *
 * // Register agent states
 * coordinator.updateAgentState("drone-01", { velocityMps: 3.0, massKg: 2.5, ... });
 *
 * // Request action — checks swarm constraints THEN individual gateway
 * const result = await coordinator.requestAction("drone-01", sintRequest);
 * ```
 */
export class SwarmCoordinator {
  private readonly agentGateways: ReadonlyMap<string, PolicyGateway>;
  private readonly constraints: SwarmConstraints;
  private readonly agentStates = new Map<string, SwarmAgentState>();

  constructor(config: SwarmCoordinatorConfig) {
    this.agentGateways = config.agentGateways;
    this.constraints = config.swarmConstraints;
  }

  /**
   * Update the live state of an agent in the swarm registry.
   * Call this on every control cycle with fresh telemetry.
   */
  updateAgentState(
    agentId: string,
    state: Omit<SwarmAgentState, "agentId" | "lastHeartbeat">,
  ): void {
    this.agentStates.set(agentId, {
      ...state,
      agentId,
      lastHeartbeat: new Date().toISOString(),
    });
  }

  /**
   * Request authorization for an agent action under both swarm and individual constraints.
   *
   * @returns The PolicyDecision, potentially overridden by swarm constraints.
   */
  async requestAction(
    agentId: string,
    request: SintRequest,
  ): Promise<{ decision: PolicyDecision; swarmCheck: SwarmConstraintResult }> {
    // 1. Check collective constraints
    const swarmCheck = this.checkSwarmConstraints(agentId, request);

    if (!swarmCheck.satisfied) {
      const denial: PolicyDecision = {
        requestId: request.requestId,
        timestamp: new Date().toISOString(),
        action: "deny",
        denial: {
          reason: `Swarm constraint violation: ${swarmCheck.violations.join("; ")}`,
          policyViolated: "SWARM_CONSTRAINT",
        },
        assignedTier: ApprovalTier.T0_OBSERVE,
        assignedRisk: "T0_read" as any,
      };
      return { decision: denial, swarmCheck };
    }

    // 2. Individual PolicyGateway check
    const gateway = this.agentGateways.get(agentId);
    if (!gateway) {
      const denial: PolicyDecision = {
        requestId: request.requestId,
        timestamp: new Date().toISOString(),
        action: "deny",
        denial: { reason: `Agent ${agentId} not registered in swarm`, policyViolated: "AGENT_NOT_REGISTERED" },
        assignedTier: ApprovalTier.T0_OBSERVE,
        assignedRisk: "T0_read" as any,
      };
      return { decision: denial, swarmCheck };
    }

    const decision = await gateway.intercept(request);
    return { decision, swarmCheck };
  }

  /**
   * Check collective swarm constraints for a proposed action.
   * Does NOT check individual token constraints — that's PolicyGateway's job.
   */
  checkSwarmConstraints(
    agentId: string,
    request: SintRequest,
  ): SwarmConstraintResult {
    const violations: string[] = [];
    const states = this.agentStates;

    // Count agents currently in ACT/COMMIT tier
    const actingCount = [...states.values()].filter((s) => ACT_TIERS.has(s.currentTier)).length;

    // Compute collective KE
    const collKE = collectiveKE(states);

    // Compute min inter-agent distance
    const minDist = minPairDistance(states);

    // Escalated fraction
    const totalAgents = states.size;
    const escalatedCount = [...states.values()].filter((s) => s.csmlEscalated).length;
    const escalatedFraction = totalAgents > 0 ? escalatedCount / totalAgents : 0;

    // Check maxConcurrentActors
    if (this.constraints.maxConcurrentActors !== undefined) {
      // This agent would become a new actor — check if adding it exceeds limit
      const thisAgentAlreadyCounting = states.get(agentId)
        ? ACT_TIERS.has(states.get(agentId)!.currentTier)
        : false;
      const wouldBeActing = actingCount + (thisAgentAlreadyCounting ? 0 : 1);

      if (wouldBeActing > this.constraints.maxConcurrentActors) {
        violations.push(
          `maxConcurrentActors exceeded: ${wouldBeActing}/${this.constraints.maxConcurrentActors} agents would be in ACT tier`
        );
      }
    }

    // Check maxCollectiveKineticEnergyJ
    if (this.constraints.maxCollectiveKineticEnergyJ !== undefined) {
      const agentState = states.get(agentId);
      // Estimate new KE including this agent's commanded velocity
      const newVelocity = request.physicalContext?.currentVelocityMps;
      const agentMass = agentState?.massKg;
      const additionalKE =
        newVelocity !== undefined && agentMass !== undefined
          ? 0.5 * agentMass * newVelocity ** 2
          : 0;
      const currentAgentKE =
        agentState?.velocityMps !== undefined && agentMass !== undefined
          ? 0.5 * agentMass * agentState.velocityMps ** 2
          : 0;
      const projectedKE = collKE - currentAgentKE + additionalKE;

      if (projectedKE > this.constraints.maxCollectiveKineticEnergyJ) {
        violations.push(
          `maxCollectiveKineticEnergyJ exceeded: projected ${projectedKE.toFixed(1)} J > limit ${this.constraints.maxCollectiveKineticEnergyJ} J`
        );
      }
    }

    // Check minInterAgentDistanceM
    if (this.constraints.minInterAgentDistanceM !== undefined && minDist !== null) {
      if (minDist < this.constraints.minInterAgentDistanceM) {
        violations.push(
          `minInterAgentDistanceM violated: current minimum ${minDist.toFixed(2)}m < required ${this.constraints.minInterAgentDistanceM}m`
        );
      }
    }

    // Check maxEscalatedFraction
    if (this.constraints.maxEscalatedFraction !== undefined && totalAgents > 0) {
      if (escalatedFraction > this.constraints.maxEscalatedFraction) {
        violations.push(
          `maxEscalatedFraction exceeded: ${(escalatedFraction * 100).toFixed(0)}% of swarm CSML-escalated > limit ${(this.constraints.maxEscalatedFraction * 100).toFixed(0)}%`
        );
      }
    }

    return {
      satisfied: violations.length === 0,
      violations,
      swarmMetrics: {
        activeAgentCount: states.size,
        actingAgentCount: actingCount,
        collectiveKineticEnergyJ: collKE,
        escalatedFraction,
        minInterAgentDistanceM: minDist,
      },
    };
  }

  /** Get all registered agent states. */
  getAgentStates(): ReadonlyMap<string, SwarmAgentState> {
    return this.agentStates;
  }

  /** Number of registered agents. */
  get size(): number {
    return this.agentGateways.size;
  }
}
