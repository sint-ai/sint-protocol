/**
 * Managed-autonomy supervisor conformance surface.
 *
 * Keeps the new authority-axis package visible in the existing conformance
 * regression suite while the package itself owns the full 12-scenario pack.
 */

import { describe, expect, it } from "vitest";
import {
  ALL_STATES,
  AUTONOMY_CONFORMANCE_SCENARIOS,
  AutonomyState,
  TRANSITIONS,
  autonomyEvaluationToLedgerEvents,
  outputAllowed,
  validateAutonomyPolicy,
  type AutonomyEvaluation,
  type GuardState,
} from "@pshkv/autonomy-supervisor";

const cleanGuard: GuardState = {
  invalid: false,
  unsafeUnrecoverable: false,
  disagree: false,
  assistAvailable: false,
  timeoutM: false,
  timeoutA: false,
  extAuth: false,
};

describe("Managed-autonomy supervisor package conformance", () => {
  it("declares the 12 required autonomy conformance scenarios", () => {
    expect(AUTONOMY_CONFORMANCE_SCENARIOS).toEqual([
      "stable_allows_when_policy_passes",
      "metacognitive_blocks_external_tool_calls",
      "assisted_blocks_unilateral_action",
      "regulated_control_revokes_authority",
      "invalid_guard_moves_stable_to_recovery",
      "recovery_timeout_forces_assisted_or_regulated",
      "assistance_disagreement_forces_regulated_control",
      "stable_restoration_requires_evidence",
      "autonomy_transition_is_ledgered",
      "estop_overrides_all_autonomy_states",
      "capability_token_cannot_override_suspension",
      "approval_cannot_override_regulated_without_external_authorization",
    ]);
  });

  it("keeps external output structurally gated to stable clean guards", () => {
    for (const state of ALL_STATES) {
      expect(outputAllowed(state, cleanGuard)).toBe(state === AutonomyState.STABLE);
    }
    expect(outputAllowed(AutonomyState.STABLE, {
      ...cleanGuard,
      invalid: true,
    })).toBe(false);
  });

  it("rejects non-external regulated restoration controllers", () => {
    expect(validateAutonomyPolicy({
      requiredState: "stable",
      guardProfileId: "mcp",
      regulatedController: "policy_gateway",
      failClosed: true,
    }).ok).toBe(false);
    expect(validateAutonomyPolicy({
      requiredState: "stable",
      guardProfileId: "mcp",
      regulatedController: "human_operator",
      failClosed: true,
    }).ok).toBe(true);
  });

  it("maps regulated transitions to append-only authority revocation events", () => {
    const evaluation: AutonomyEvaluation = {
      agentId: "a".repeat(64),
      requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
      previousState: AutonomyState.ASSISTED,
      nextState: AutonomyState.REGULATED,
      decision: "revoke_authority",
      firedTransition: "t_AR",
      outputPermitted: false,
      reason: "t_AR: assisted_recovery -> regulated_control",
      timestamp: "2026-05-28T10:00:00.000000Z",
    };
    const eventTypes = autonomyEvaluationToLedgerEvents(evaluation, {
      outputAttempted: true,
    }).map((event) => event.eventType);

    expect(eventTypes).toEqual(
      expect.arrayContaining([
        "autonomy.guard.triggered",
        "autonomy.authority.revoked",
        "governance.control.surrendered",
        "autonomy.output.suppressed",
      ]),
    );
    expect(TRANSITIONS.some((transition) => transition.name === "t_AR")).toBe(true);
  });
});
