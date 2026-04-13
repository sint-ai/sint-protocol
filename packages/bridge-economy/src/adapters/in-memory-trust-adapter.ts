/**
 * SINT Protocol — In-Memory Trust Adapter.
 *
 * Testing implementation of ITrustPort with configurable
 * trust levels per agent/user.
 *
 * @module @sint/bridge-economy/adapters/in-memory-trust-adapter
 */

import { ok, type Result } from "@pshkv/core";
import type {
  ITrustPort,
  TrustEvalParams,
  TrustEvalResult,
  EconomyTrustLevel,
} from "../interfaces.js";

/**
 * In-memory trust adapter for testing.
 *
 * @example
 * ```ts
 * const adapter = new InMemoryTrustAdapter("low_risk");
 * adapter.setTrustLevel("risky-agent", "high_risk");
 * const result = await adapter.evaluateTrust({ agentId: "risky-agent", ... });
 * // result.value.trustLevel === "high_risk"
 * ```
 */
export class InMemoryTrustAdapter implements ITrustPort {
  private readonly defaultLevel: EconomyTrustLevel;
  private readonly trustLevels = new Map<string, EconomyTrustLevel>();
  private readonly trustScores = new Map<string, number>();

  constructor(defaultLevel: EconomyTrustLevel = "unrestricted") {
    this.defaultLevel = defaultLevel;
  }

  async evaluateTrust(params: TrustEvalParams): Promise<Result<TrustEvalResult, Error>> {
    // Check by agentId first, then userId
    const level =
      this.trustLevels.get(params.agentId) ??
      this.trustLevels.get(params.userId) ??
      this.defaultLevel;

    const score = this.trustScores.get(params.agentId) ?? this.levelToScore(level);

    return ok({
      trustLevel: level,
      score,
      reason: `Trust level for agent "${params.agentId}": ${level}`,
    });
  }

  /** Set trust level for a specific agent or user (test helper). */
  setTrustLevel(id: string, level: EconomyTrustLevel): void {
    this.trustLevels.set(id, level);
  }

  /** Set trust score for a specific agent (test helper). */
  setTrustScore(agentId: string, score: number): void {
    this.trustScores.set(agentId, score);
  }

  private levelToScore(level: EconomyTrustLevel): number {
    switch (level) {
      case "unrestricted": return 1.0;
      case "low_risk": return 0.8;
      case "medium_risk": return 0.5;
      case "high_risk": return 0.2;
      case "blocked": return 0.0;
    }
  }
}
