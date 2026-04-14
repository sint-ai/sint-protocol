/**
 * SINT Protocol — Avatar Layer (L5) types.
 *
 * The Avatar layer is the behavioral identity layer — the persistent record
 * of who an agent *is* based on what it has *done*. Unlike capability tokens
 * (what an agent is *allowed* to do), an avatar profile reflects observed
 * behavior over time.
 *
 * An avatar profile is computed from the Evidence Ledger and updated whenever
 * the agent acts. It drives CSML-based tier escalation: an agent with a high
 * safety-model latency score gets automatically bumped to higher tiers
 * regardless of what its token says.
 *
 * Invariant: avatar tier adjustment is ADDITIVE — it can only increase the
 * assigned tier, never decrease it.
 *
 * @module @sint/avatar/types
 */

import type { ApprovalTier } from "@pshkv/core";

// ─── Core Profile ─────────────────────────────────────────────────────────────

/**
 * Behavioral classification of an agent based on observed ledger history.
 * Determined by CSML score trajectory and safety event frequency.
 */
export type AgentPersona =
  | "compliant"    // CSML consistently below θ — nominal behavior
  | "drifting"     // CSML trending upward — watch closely
  | "high_risk"    // CSML exceeded θ — auto-escalation active
  | "anomalous"    // Safety events detected (force exceeded, geofence violation)
  | "unknown";     // Insufficient data (< 10 request events)

/**
 * A snapshot of an agent's CSML score at a point in time.
 */
export interface CsmlSnapshot {
  /** When this snapshot was computed. */
  readonly timestamp: string;
  /** CSML score at this timestamp (0–1). */
  readonly score: number;
  /** Number of ledger events used in computation. */
  readonly eventCount: number;
  /** Whether this score exceeded the escalation threshold. */
  readonly exceeded: boolean;
}

/**
 * Persistent behavioral identity profile for a SINT agent.
 *
 * Computed from the Evidence Ledger. Updated incrementally as new events arrive.
 * Drives CSML-based tier escalation in PolicyGateway.
 */
export interface AvatarProfile {
  /** Agent identity (Ed25519 public key hex). */
  readonly agentId: string;

  /** Human-readable display name (optional, set by operator). */
  readonly displayName?: string;

  /** Behavioral persona derived from CSML score and safety events. */
  readonly persona: AgentPersona;

  /**
   * Current CSML score (most recent computation).
   * null when insufficient data.
   */
  readonly currentCsmlScore: number | null;

  /**
   * The CSML escalation threshold for this agent.
   * Defaults to DEFAULT_CSML_THETA (0.3). Can be tightened per-agent by operators.
   */
  readonly csmlTheta: number;

  /**
   * Recent CSML score history (last N snapshots, newest first).
   * Used for trend detection (drifting persona).
   */
  readonly csmlHistory: readonly CsmlSnapshot[];

  /** Number of total ledger events for this agent. */
  readonly totalEventCount: number;

  /** Number of safety events (force exceeded, geofence, E-stop). */
  readonly safetyEventCount: number;

  /** Number of requests that were denied by the policy gateway. */
  readonly deniedRequestCount: number;

  /** Number of times CSML escalation bumped this agent's tier. */
  readonly escalationCount: number;

  /** Timestamp of profile creation (ISO 8601). */
  readonly createdAt: string;

  /** Timestamp of last profile update (ISO 8601). */
  readonly lastSeenAt: string;
}

// ─── Escalation ───────────────────────────────────────────────────────────────

/**
 * Result of CSML-based tier escalation evaluation for a single request.
 */
export interface CsmlEscalationDecision {
  /** Whether the tier was bumped. */
  readonly escalated: boolean;

  /** The original tier before escalation. */
  readonly baseTier: ApprovalTier;

  /**
   * The final tier after escalation.
   * Equals baseTier when escalated=false.
   */
  readonly resultTier: ApprovalTier;

  /** CSML score that triggered (or did not trigger) escalation. */
  readonly csmlScore: number | null;

  /** Human-readable reason for the escalation decision. */
  readonly reason: string;
}

// ─── Query interface ──────────────────────────────────────────────────────────

/**
 * Function that retrieves recent ledger events for an agent.
 * Injected into CsmlEscalator — decouples from EvidenceLedger impl.
 */
export type AgentEventQuery = (
  agentId: string,
  windowSize: number
) => readonly import("@pshkv/core").SintLedgerEvent[] | Promise<readonly import("@pshkv/core").SintLedgerEvent[]>;
