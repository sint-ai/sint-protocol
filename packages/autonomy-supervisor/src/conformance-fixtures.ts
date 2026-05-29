export const AUTONOMY_CONFORMANCE_SCENARIOS = [
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
] as const;

export type AutonomyConformanceScenario =
  (typeof AUTONOMY_CONFORMANCE_SCENARIOS)[number];
