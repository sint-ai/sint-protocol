/**
 * SINT Protocol — Swarm Coordination types.
 *
 * Defines the collective constraint model for multi-agent physical systems.
 *
 * Individual capability tokens govern what a single agent may do.
 * Swarm constraints govern what the *collective* may do — properties that
 * only emerge at the group level and cannot be captured by per-agent tokens.
 *
 * Key emergent risks:
 * - Convergence: N agents approaching the same point → kinetic energy ≫ individual
 * - Encirclement: agents forming a closed formation around a human
 * - Cascade: one agent failure triggers chain of denied requests across swarm
 * - Byzantine: k compromised agents in a coordinated attack
 *
 * @module @sint/bridge-swarm/swarm-types
 */

import type { ApprovalTier, SintCapabilityToken } from "@sint-ai/core";

// ─── Swarm constraints ────────────────────────────────────────────────────────

/**
 * Collective physical constraints for a swarm of agents.
 * These are ADDITIVE to individual token constraints — both must be satisfied.
 *
 * Ref: NATO STANAG 4586 (UAS control), ASTM F3586-21 (swarm deconfliction)
 */
export interface SwarmConstraints {
  /**
   * Maximum number of agents that can be in ACT or COMMIT tier simultaneously.
   * Prevents N agents from all moving at once in a shared workspace.
   * Default: ⌊N/4⌋ (25% of swarm can act simultaneously).
   */
  readonly maxConcurrentActors?: number;

  /**
   * Minimum distance between any two agents (meters).
   * Enforced at the command level — movement commands are denied if they
   * would bring agents within this distance.
   */
  readonly minInterAgentDistanceM?: number;

  /**
   * Maximum collective kinetic energy (joules = Σ½mv²) for the entire swarm.
   * Prevents convergence events where individual velocities are safe but
   * the collective impact would be hazardous.
   * For a 2.5 kg drone at 5 m/s: KE = 31.25 J. 20 drones = 625 J.
   */
  readonly maxCollectiveKineticEnergyJ?: number;

  /**
   * Maximum density of agents in a volume (agents per m³).
   * Prevents encirclement of humans or dangerous concentration.
   */
  readonly maxAgentDensityPerM3?: number;

  /**
   * Minimum number of agents that must agree before a T3_COMMIT action proceeds.
   * Byzantine-resilient threshold: k > N/3 for BFT, k > N/2 for crash-tolerant.
   * This is the swarm-level extension of M-of-N quorum.
   */
  readonly commitQuorumK?: number;

  /**
   * Maximum fraction of the swarm that can be in CSML-escalated state
   * before the entire swarm escalates to the next tier.
   * Default: 0.2 (if 20% of agents are in high-risk persona, all escalate).
   */
  readonly maxEscalatedFraction?: number;
}

// ─── Agent state in swarm ─────────────────────────────────────────────────────

/** Live state of one agent within a swarm. */
export interface SwarmAgentState {
  /** Agent ID (Ed25519 public key). */
  readonly agentId: string;

  /** Current capability token. */
  readonly token: SintCapabilityToken;

  /** Current 3D position (NED frame, meters from reference). */
  readonly position?: {
    readonly north: number;
    readonly east: number;
    readonly down: number;
  };

  /** Current velocity magnitude (m/s). */
  readonly velocityMps?: number;

  /** Vehicle mass in kg (for kinetic energy computation). */
  readonly massKg?: number;

  /** Current assigned tier (from PolicyGateway). */
  readonly currentTier: ApprovalTier;

  /** Whether this agent is currently CSML-escalated. */
  readonly csmlEscalated: boolean;

  /** Last heartbeat timestamp (ISO 8601). */
  readonly lastHeartbeat: string;
}

// ─── Swarm decision ───────────────────────────────────────────────────────────

/**
 * Result of collective constraint evaluation for a single agent's action request.
 */
export interface SwarmConstraintResult {
  /** Whether the collective constraints are satisfied. */
  readonly satisfied: boolean;

  /**
   * If not satisfied: the reason the collective check failed.
   * E.g. "maxConcurrentActors exceeded: 5/4 agents in ACT tier"
   */
  readonly violations: readonly string[];

  /** Current swarm metrics at evaluation time. */
  readonly swarmMetrics: {
    readonly activeAgentCount: number;
    readonly actingAgentCount: number;
    readonly collectiveKineticEnergyJ: number;
    readonly escalatedFraction: number;
    readonly minInterAgentDistanceM: number | null;
  };
}
