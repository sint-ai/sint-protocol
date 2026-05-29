/**
 * Autonomy supervisor Evidence Ledger event mapping.
 *
 * The helper returns append inputs for the existing hash-chained ledger. It
 * never mutates prior events and never introduces update/delete semantics.
 */

import { z } from "zod";
import type { SintEventType, UUIDv7 } from "@pshkv/core";
import { AutonomyState } from "./autonomy-states.js";
import type { AutonomyEvaluation } from "./supervisor.js";

export const autonomyEventTypeSchema = z.enum([
  "autonomy.state.entered",
  "autonomy.state.exited",
  "autonomy.guard.triggered",
  "autonomy.output.suppressed",
  "autonomy.recovery.started",
  "autonomy.recovery.succeeded",
  "autonomy.recovery.failed",
  "autonomy.assistance.requested",
  "autonomy.assistance.resolved",
  "autonomy.authority.revoked",
  "autonomy.authority.restored",
  "governance.control.surrendered",
]);

export type AutonomyEventType = z.infer<typeof autonomyEventTypeSchema>;

export const autonomyEvaluationPayloadSchema = z.object({
  requestId: z.string().min(1),
  previousState: z.nativeEnum(AutonomyState),
  nextState: z.nativeEnum(AutonomyState),
  decision: z.enum([
    "retain_authority",
    "suspend_authority",
    "request_assistance",
    "revoke_authority",
  ]),
  firedTransition: z.string().nullable(),
  outputPermitted: z.boolean(),
  reason: z.string().min(1),
  evaluationTimestamp: z.string().min(1),
}).strict();

export type AutonomyEvaluationPayload = z.infer<
  typeof autonomyEvaluationPayloadSchema
>;

export interface AutonomyLedgerAppend {
  readonly eventType: AutonomyEventType;
  readonly agentId: string;
  readonly tokenId?: UUIDv7;
  readonly payload: Record<string, unknown>;
}

export interface AutonomyLedgerMappingOptions {
  readonly tokenId?: UUIDv7;
  readonly outputAttempted?: boolean;
}

function basePayload(evaluation: AutonomyEvaluation): AutonomyEvaluationPayload {
  return autonomyEvaluationPayloadSchema.parse({
    requestId: evaluation.requestId,
    previousState: evaluation.previousState,
    nextState: evaluation.nextState,
    decision: evaluation.decision,
    firedTransition: evaluation.firedTransition,
    outputPermitted: evaluation.outputPermitted,
    reason: evaluation.reason,
    evaluationTimestamp: evaluation.timestamp,
  });
}

function append(
  out: AutonomyLedgerAppend[],
  evaluation: AutonomyEvaluation,
  eventType: AutonomyEventType,
  payload: Record<string, unknown>,
  tokenId?: UUIDv7,
): void {
  out.push({
    eventType,
    agentId: evaluation.agentId,
    tokenId,
    payload: {
      ...basePayload(evaluation),
      ...payload,
    },
  });
}

export function autonomyEvaluationToLedgerEvents(
  evaluation: AutonomyEvaluation,
  options: AutonomyLedgerMappingOptions = {},
): readonly AutonomyLedgerAppend[] {
  const out: AutonomyLedgerAppend[] = [];
  const tokenId = options.tokenId;

  append(out, evaluation, "autonomy.guard.triggered", {
    transition: evaluation.firedTransition,
    triggered: evaluation.firedTransition !== null,
  }, tokenId);

  if (evaluation.previousState !== evaluation.nextState) {
    append(out, evaluation, "autonomy.state.exited", {
      state: evaluation.previousState,
    }, tokenId);
    append(out, evaluation, "autonomy.state.entered", {
      state: evaluation.nextState,
    }, tokenId);
  }

  switch (evaluation.firedTransition) {
    case "t_SM":
      append(out, evaluation, "autonomy.recovery.started", {
        recoveryState: AutonomyState.METACOGNITIVE,
      }, tokenId);
      break;
    case "t_MS":
    case "t_AS":
      append(out, evaluation, "autonomy.recovery.succeeded", {
        restoredState: AutonomyState.STABLE,
      }, tokenId);
      break;
    case "t_MA":
      append(out, evaluation, "autonomy.assistance.requested", {
        recoveryState: AutonomyState.ASSISTED,
      }, tokenId);
      break;
    case "t_MR":
    case "t_SR":
    case "t_AR":
      append(out, evaluation, "autonomy.recovery.failed", {
        governedState: AutonomyState.REGULATED,
      }, tokenId);
      append(out, evaluation, "autonomy.authority.revoked", {
        governedState: AutonomyState.REGULATED,
      }, tokenId);
      append(out, evaluation, "governance.control.surrendered", {
        governedState: AutonomyState.REGULATED,
      }, tokenId);
      break;
    case "t_RS":
      append(out, evaluation, "autonomy.assistance.resolved", {
        restoredState: AutonomyState.STABLE,
      }, tokenId);
      append(out, evaluation, "autonomy.authority.restored", {
        restoredState: AutonomyState.STABLE,
      }, tokenId);
      break;
    case null:
      break;
  }

  if (options.outputAttempted === true && !evaluation.outputPermitted) {
    append(out, evaluation, "autonomy.output.suppressed", {
      suppressedState: evaluation.nextState,
    }, tokenId);
  }

  return out;
}

export function asSintEventType(eventType: AutonomyEventType): SintEventType {
  return eventType as SintEventType;
}
