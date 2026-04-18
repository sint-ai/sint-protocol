/**
 * SINT Protocol — ObstacleAwareEnvelope reference implementation.
 *
 * Implements DynamicEnvelopePlugin for ROS 2 agents. Tightens velocity
 * constraints based on nearest-obstacle distance from a laser scan or
 * proximity sensor feed. Closes the ROSClaw static-envelope gap:
 *
 *   token.maxVelocityMps = 2.0 (set at provisioning)
 *   obstacle at 0.4m → effectiveMax = 0.4 * reactionFactor = 0.2 m/s
 *   actual limit enforced = min(2.0, 0.2) = 0.2 m/s
 *
 * The reaction factor encodes the stopping-distance physics:
 *   reactionFactor = maxDeceleration_m_s2 * reactionTime_s
 *
 * Example: maxDecel=2.0 m/s², reactionTime=0.25s → factor=0.5
 *   obstacle at 1.0m → effectiveMax = 0.5 m/s
 *   obstacle at 0.2m → effectiveMax = 0.1 m/s
 *
 * Usage:
 * ```typescript
 * const envelope = new ObstacleAwareEnvelope({
 *   getNearestObstacleM: () => lidar.nearestObstacleM(),
 *   reactionFactor: 0.5,
 *   minClearanceM: 0.3,      // stop completely if obstacle < 0.3m
 * });
 *
 * const gateway = new PolicyGateway({
 *   resolveToken: ...,
 *   dynamicEnvelope: envelope,
 * });
 * ```
 *
 * @module @sint/bridge-ros2/obstacle-envelope
 */

import type { DynamicEnvelopePlugin } from "@pshkv/gate-policy-gateway";
import type { SintRequest } from "@pshkv/core";

/** Configuration for ObstacleAwareEnvelope. */
export interface ObstacleAwareEnvelopeConfig {
  /**
   * Function returning the nearest obstacle distance in metres.
   * Called synchronously on every intercept. Use a cached sensor value —
   * do not make this a blocking I/O call.
   *
   * Return Infinity when no obstacle is within sensing range.
   */
  getNearestObstacleM: (request: SintRequest) => number | Promise<number>;

  /**
   * Reaction factor: effectiveVelocity = obstacleDistanceM * reactionFactor
   *
   * Encodes stopping physics:
   *   reactionFactor ≈ maxDeceleration_m_s2 * reactionTime_s
   *
   * Default: 0.5 (suitable for slow mobile robots with 2 m/s² deceleration)
   * For drones with fast control loops: 1.0–2.0
   * For industrial arms: 0.2–0.5
   */
  readonly reactionFactor?: number;

  /**
   * Minimum clearance (m). Below this distance, velocity is capped to 0.
   * Default: 0.2m
   */
  readonly minClearanceM?: number;

  /**
   * Maximum force reduction factor when obstacle is within 2× minClearanceM.
   * Set to undefined to disable force envelope (velocity only).
   * Default: 0.3 (force capped to 30% of token limit when very close)
   */
  readonly forceFactor?: number | undefined;
}

const DEFAULT_REACTION_FACTOR = 0.5;
const DEFAULT_MIN_CLEARANCE_M = 0.2;

/**
 * Reference DynamicEnvelopePlugin implementation for ROS 2 agents.
 * Environment-adaptive velocity and force constraint tightening.
 */
export class ObstacleAwareEnvelope implements DynamicEnvelopePlugin {
  private readonly config: Required<Omit<ObstacleAwareEnvelopeConfig, "forceFactor">> & {
    forceFactor: number | undefined;
  };

  constructor(config: ObstacleAwareEnvelopeConfig) {
    this.config = {
      getNearestObstacleM: config.getNearestObstacleM,
      reactionFactor: config.reactionFactor ?? DEFAULT_REACTION_FACTOR,
      minClearanceM: config.minClearanceM ?? DEFAULT_MIN_CLEARANCE_M,
      forceFactor: config.forceFactor ?? 0.3,
    };
  }

  async computeEnvelope(request: SintRequest): Promise<{
    maxVelocityMps?: number;
    maxForceNewtons?: number;
    reason?: string;
  }> {
    const obstacleM = await this.config.getNearestObstacleM(request);

    // No obstacle in range — no tightening needed
    if (!isFinite(obstacleM) || obstacleM <= 0) {
      return {};
    }

    // Below minimum clearance → full stop
    if (obstacleM <= this.config.minClearanceM) {
      const result: { maxVelocityMps: number; maxForceNewtons?: number; reason: string } = {
        maxVelocityMps: 0,
        reason: `obstacle at ${obstacleM.toFixed(2)}m ≤ minClearance ${this.config.minClearanceM}m — stop`,
      };
      if (this.config.forceFactor !== undefined) {
        // At minimum clearance, cap force to forceFactor fraction of whatever token allows
        // We don't know the token limit here, so return a very low absolute cap
        // (the gateway enforces min(token, envelope))
        result.maxForceNewtons = 0;
      }
      return result;
    }

    // Proportional velocity tightening
    const effectiveVelocity = obstacleM * this.config.reactionFactor;

    // Force tightening within 2× minClearance
    let maxForceNewtons: number | undefined;
    if (
      this.config.forceFactor !== undefined &&
      obstacleM <= this.config.minClearanceM * 2
    ) {
      // Linearly reduce force as obstacle approaches minimum clearance
      const proximity = 1 - (obstacleM - this.config.minClearanceM) / this.config.minClearanceM;
      // Return a fractional cap — gateway applies min(token.force, this)
      // Use a sentinel: 1 - proximity * (1 - forceFactor) fraction of some reference
      // Since we don't know the token limit, emit as a ratio signal
      // For simplicity: cap to forceFactor * 1000N (will be min'd with token limit)
      maxForceNewtons = this.config.forceFactor * 1000 * (1 - proximity);
    }

    return {
      maxVelocityMps: effectiveVelocity,
      ...(maxForceNewtons !== undefined ? { maxForceNewtons } : {}),
      reason: `obstacle at ${obstacleM.toFixed(2)}m → velocity capped to ${effectiveVelocity.toFixed(2)} m/s`,
    };
  }
}
