/**
 * SINT Protocol — Emergency bypass controls for safety-critical contexts.
 *
 * Provides a tightly scoped, time-bounded override path with mandatory
 * post-hoc audit records.
 */

import { createHash, randomUUID } from "node:crypto";
import type { ApprovalTier } from "@pshkv/core";

export type EmergencyTriggerReason = "medical" | "fire" | "security" | "fall";

export interface EmergencyAction {
  readonly actionId: string;
  readonly agentId: string;
  readonly resource: string;
  readonly operation: string;
  readonly assignedTier: ApprovalTier;
}

export interface EmergencyJustification {
  readonly triggerReason: EmergencyTriggerReason;
  readonly summary: string;
  readonly initiatedBy: string;
  /** Requested duration in milliseconds (hard-capped to maxDurationMs). */
  readonly durationMs?: number;
}

export interface EmergencyContextWindow {
  readonly triggeredAt: string;
  readonly expiresAt: string;
  readonly triggerReason: EmergencyTriggerReason;
}

export interface BypassToken {
  readonly bypassId: string;
  readonly actionId: string;
  readonly agentId: string;
  readonly resource: string;
  readonly operation: string;
  readonly originalTier: ApprovalTier;
  readonly enforcedTier: ApprovalTier;
  readonly context: EmergencyContextWindow;
  readonly initiatedBy: string;
  readonly justification: string;
}

export interface EmergencyAuditEntry {
  readonly bypassId: string;
  readonly eventType: "emergency_bypass_issued";
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly triggerReason: EmergencyTriggerReason;
  readonly initiatedBy: string;
  readonly actionId: string;
  readonly hash: string;
}

export interface EmergencyBypassProtocolOptions {
  /** Hard cap for emergency window duration in milliseconds (default: 1 hour). */
  readonly maxDurationMs?: number;
  /** Test seam for deterministic time in unit tests. */
  readonly now?: () => Date;
}

const ONE_HOUR_MS = 60 * 60 * 1000;

export class EmergencyBypassProtocol {
  private readonly maxDurationMs: number;
  private readonly now: () => Date;

  constructor(options: EmergencyBypassProtocolOptions = {}) {
    this.maxDurationMs = options.maxDurationMs ?? ONE_HOUR_MS;
    this.now = options.now ?? (() => new Date());
  }

  async bypassTier(
    action: EmergencyAction,
    justification: EmergencyJustification,
  ): Promise<BypassToken> {
    const start = this.now();
    const startMs = start.getTime();
    const requestedDuration = justification.durationMs ?? this.maxDurationMs;
    const boundedDuration = Math.max(1, Math.min(requestedDuration, this.maxDurationMs));
    const expiresAt = new Date(startMs + boundedDuration);

    return {
      bypassId: randomUUID(),
      actionId: action.actionId,
      agentId: action.agentId,
      resource: action.resource,
      operation: action.operation,
      originalTier: action.assignedTier,
      enforcedTier: action.assignedTier,
      context: {
        triggeredAt: toIso8601Micros(start),
        expiresAt: toIso8601Micros(expiresAt),
        triggerReason: justification.triggerReason,
      },
      initiatedBy: justification.initiatedBy,
      justification: justification.summary,
    };
  }

  async logEmergencyBypass(bypass: BypassToken): Promise<EmergencyAuditEntry> {
    const entryWithoutHash = {
      bypassId: bypass.bypassId,
      eventType: "emergency_bypass_issued" as const,
      issuedAt: bypass.context.triggeredAt,
      expiresAt: bypass.context.expiresAt,
      triggerReason: bypass.context.triggerReason,
      initiatedBy: bypass.initiatedBy,
      actionId: bypass.actionId,
    };

    return {
      ...entryWithoutHash,
      hash: sha256(JSON.stringify(entryWithoutHash)),
    };
  }
}

function toIso8601Micros(date: Date): string {
  return date.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

