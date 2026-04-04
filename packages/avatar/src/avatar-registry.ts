/**
 * SINT Protocol — Avatar Registry.
 *
 * In-memory store for AvatarProfiles. In production, back this with a
 * PostgreSQL adapter (same pattern as @sint/persistence).
 *
 * The registry computes profiles from raw ledger events via
 * `updateFromEvents()`. It does NOT query the ledger directly — the caller
 * provides the events (dependency injection, testable without ledger).
 *
 * @module @sint/avatar/avatar-registry
 */

import { computeCsml } from "@sint/gate-evidence-ledger";
import type { SintLedgerEvent } from "@sint/core";
import { DEFAULT_CSML_COEFFICIENTS } from "@sint/core";
import type { AvatarProfile, AgentPersona, CsmlSnapshot } from "./types.js";

/** Default CSML escalation threshold (human workspace safety margin). */
export const DEFAULT_CSML_THETA = 0.3;

/** How many CSML snapshots to retain in history per agent. */
const CSML_HISTORY_MAX = 10;

const SAFETY_EVENT_TYPES = new Set([
  "safety.force.exceeded",
  "safety.geofence.violation",
  "safety.estop.triggered",
  "safety.anomaly.detected",
]);

/**
 * Mutable internal profile state (converted to readonly AvatarProfile on read).
 */
interface MutableProfile {
  agentId: string;
  displayName?: string;
  csmlTheta: number;
  csmlHistory: CsmlSnapshot[];
  escalationCount: number;
  createdAt: string;
  lastSeenAt: string;
}

function derivePersona(
  csmlScore: number | null,
  theta: number,
  safetyCount: number,
  csmlHistory: readonly CsmlSnapshot[],
): AgentPersona {
  // Safety violations are always anomalous regardless of CSML data availability
  if (safetyCount > 0) return "anomalous";
  if (csmlScore === null) return "unknown";
  if (csmlScore > theta) return "high_risk";
  // Drifting: last 3 scores trending upward
  if (csmlHistory.length >= 3) {
    const recent = csmlHistory.slice(0, 3).map((s) => s.score);
    if (recent[0]! > recent[1]! && recent[1]! > recent[2]!) return "drifting";
  }
  return "compliant";
}

/**
 * In-memory registry for AvatarProfiles.
 *
 * @example
 * ```ts
 * const registry = new AvatarRegistry();
 * const profile = registry.getOrCreate("a1b2c3...");
 * registry.updateFromEvents("a1b2c3...", agentEvents);
 * ```
 */
export class AvatarRegistry {
  private readonly profiles = new Map<string, MutableProfile>();
  private readonly eventCounts = new Map<string, number>();
  private readonly safetyEventCounts = new Map<string, number>();
  private readonly deniedCounts = new Map<string, number>();

  /**
   * Get an existing profile or create a fresh one.
   */
  getOrCreate(agentId: string, options?: { displayName?: string; csmlTheta?: number }): AvatarProfile {
    if (!this.profiles.has(agentId)) {
      const now = new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
      this.profiles.set(agentId, {
        agentId,
        displayName: options?.displayName,
        csmlTheta: options?.csmlTheta ?? DEFAULT_CSML_THETA,
        csmlHistory: [],
        escalationCount: 0,
        createdAt: now,
        lastSeenAt: now,
      });
    }
    return this.buildProfile(agentId);
  }

  /**
   * Get an existing profile, or undefined if not found.
   */
  get(agentId: string): AvatarProfile | undefined {
    if (!this.profiles.has(agentId)) return undefined;
    return this.buildProfile(agentId);
  }

  /**
   * Update the profile from a batch of ledger events.
   * Recomputes CSML and updates all counters.
   * Creates the profile if it does not exist.
   */
  updateFromEvents(agentId: string, events: readonly SintLedgerEvent[]): AvatarProfile {
    // Ensure profile exists
    this.getOrCreate(agentId);
    const profile = this.profiles.get(agentId)!;

    // Recount from events (full recompute — idempotent)
    let totalEvents = 0;
    let safetyEvents = 0;
    let deniedRequests = 0;

    for (const e of events) {
      if (e.agentId !== agentId) continue;
      totalEvents++;
      if (SAFETY_EVENT_TYPES.has(e.eventType)) safetyEvents++;
      if (e.eventType === "approval.denied") deniedRequests++;
    }

    this.eventCounts.set(agentId, totalEvents);
    this.safetyEventCounts.set(agentId, safetyEvents);
    this.deniedCounts.set(agentId, deniedRequests);

    // Compute CSML
    const agentEvents = events.filter((e) => e.agentId === agentId);
    const csmlResult = computeCsml(agentEvents, DEFAULT_CSML_COEFFICIENTS);

    const now = new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");

    // Prepend snapshot (newest first)
    if (csmlResult.recommendation !== "insufficient_data") {
      const snap: CsmlSnapshot = {
        timestamp: now,
        score: csmlResult.score,
        eventCount: csmlResult.eventCount,
        exceeded: csmlResult.exceedsThreshold(profile.csmlTheta),
      };
      profile.csmlHistory = [snap, ...profile.csmlHistory].slice(0, CSML_HISTORY_MAX);
    }

    profile.lastSeenAt = now;

    return this.buildProfile(agentId);
  }

  /**
   * Record one CSML escalation event for an agent.
   */
  recordEscalation(agentId: string): void {
    const profile = this.profiles.get(agentId);
    if (profile) {
      profile.escalationCount++;
      profile.lastSeenAt = new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
    }
  }

  /**
   * Set a custom CSML theta for a specific agent.
   * Useful for tighter constraints on high-risk agents.
   */
  setTheta(agentId: string, theta: number): void {
    this.getOrCreate(agentId);
    this.profiles.get(agentId)!.csmlTheta = theta;
  }

  /** Number of profiles in the registry. */
  get size(): number {
    return this.profiles.size;
  }

  /** List all profiles. */
  list(): readonly AvatarProfile[] {
    return [...this.profiles.keys()].map((id) => this.buildProfile(id));
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private buildProfile(agentId: string): AvatarProfile {
    const p = this.profiles.get(agentId)!;
    const totalEventCount = this.eventCounts.get(agentId) ?? 0;
    const safetyEventCount = this.safetyEventCounts.get(agentId) ?? 0;
    const deniedRequestCount = this.deniedCounts.get(agentId) ?? 0;

    const latestSnapshot = p.csmlHistory[0];
    const currentCsmlScore = latestSnapshot?.score ?? null;

    const persona = derivePersona(
      currentCsmlScore,
      p.csmlTheta,
      safetyEventCount,
      p.csmlHistory,
    );

    return {
      agentId,
      displayName: p.displayName,
      persona,
      currentCsmlScore,
      csmlTheta: p.csmlTheta,
      csmlHistory: p.csmlHistory,
      totalEventCount,
      safetyEventCount,
      deniedRequestCount,
      escalationCount: p.escalationCount,
      createdAt: p.createdAt,
      lastSeenAt: p.lastSeenAt,
    };
  }
}
