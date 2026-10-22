/**
 * SINT Protocol — Tier Assignment Engine.
 *
 * Determines the approval tier for each request based on:
 * 1. The resource being accessed
 * 2. The action being performed
 * 3. Physical context (human presence, environment)
 * 4. Agent trust level
 *
 * @module @sint/gate-policy-gateway/tier-assigner
 */

import {
  ApprovalTier,
  type RiskTier,
  type SintRequest,
  type TierAssignmentRule,
  DEFAULT_TIER_RULES,
  classifyMcpPolicy,
  parseMcpResource,
  selectTierRule,
} from "@pshkv/core";
import type { AgentTrustLevel } from "@pshkv/core";

/** Result of tier assignment. */
export interface TierAssignment {
  readonly approvalTier: ApprovalTier;
  readonly riskTier: RiskTier;
  readonly escalationReasons: readonly string[];
}

/** The numeric ordering of tiers for comparison. */
const TIER_ORDER: Record<ApprovalTier, number> = {
  [ApprovalTier.T0_OBSERVE]: 0,
  [ApprovalTier.T1_PREPARE]: 1,
  [ApprovalTier.T2_ACT]: 2,
  [ApprovalTier.T3_COMMIT]: 3,
};

/**
 * Escalate a tier by one level (if not already at T3_COMMIT).
 */
function escalateTier(tier: ApprovalTier): ApprovalTier {
  switch (tier) {
    case ApprovalTier.T0_OBSERVE:
      return ApprovalTier.T1_PREPARE;
    case ApprovalTier.T1_PREPARE:
      return ApprovalTier.T2_ACT;
    case ApprovalTier.T2_ACT:
      return ApprovalTier.T3_COMMIT;
    case ApprovalTier.T3_COMMIT:
      return ApprovalTier.T3_COMMIT;
  }
}

/**
 * Assign an approval tier to a request.
 *
 * This is a pure function — deterministic for the same inputs.
 * The tier assignment follows these rules:
 * 1. Find the most specific matching rule for the resource/action
 * 2. Start with the rule's base tier
 * 3. Escalate if human presence is detected and rule says to
 * 4. Escalate if agent is new/untrusted and rule says to
 * 5. Escalate if physical context indicates danger
 *
 * @example
 * ```ts
 * const assignment = assignTier(request, {
 *   agentTrustLevel: "provisional",
 * });
 * // assignment.approvalTier === ApprovalTier.T2_ACT
 * ```
 */
export function assignTier(
  request: SintRequest,
  options: {
    rules?: readonly TierAssignmentRule[];
    agentTrustLevel?: AgentTrustLevel;
  } = {},
): TierAssignment {
  const rules = options.rules ?? DEFAULT_TIER_RULES;
  const escalationReasons: string[] = [];

  const bestRule = selectTierRule(request.resource, request.action, rules);

  // Default to PREPARE if no rule matches
  let tier = bestRule?.baseTier ?? ApprovalTier.T1_PREPARE;
  let riskTier = bestRule?.baseRisk ?? ("T1_write_low" as RiskTier);

  // Enforce shared MCP semantics even for direct gateway calls without bridge hints.
  const mcpTool = parseMcpResource(request.resource);
  if (/^mcp:\/\//i.test(request.resource)) {
    // Malformed MCP identities must not fall through to the permissive default.
    const semanticTier = mcpTool
      ? classifyMcpPolicy({ ...mcpTool, annotations: request.mcpAnnotations }).suggestedTier
      : ApprovalTier.T3_COMMIT;
    const floor = request.action === "exec.run" ? ApprovalTier.T3_COMMIT : semanticTier;
    if (TIER_ORDER[floor] > TIER_ORDER[tier]) {
      tier = floor;
      riskTier = ["T0_read", "T1_write_low", "T2_stateful", "T3_irreversible"][TIER_ORDER[tier]] as RiskTier;
      escalationReasons.push("MCP tool consequence classification");
    }
  }

  // Escalate on human presence
  if (
    bestRule?.escalateOnHumanPresence &&
    request.physicalContext?.humanDetected
  ) {
    tier = escalateTier(tier);
    escalationReasons.push("Human detected in workspace");
  }

  // Escalate for new/untrusted agents
  if (
    bestRule?.escalateOnNewAgent &&
    (options.agentTrustLevel === "untrusted" ||
      options.agentTrustLevel === "provisional")
  ) {
    tier = escalateTier(tier);
    escalationReasons.push("Agent trust level is below TRUSTED");
  }

  // Escalate if near physical limits (>80% of constraint)
  if (request.physicalContext?.currentForceNewtons !== undefined) {
    // If force is reported, we're in a physical context — minimum ACT
    if (TIER_ORDER[tier] < TIER_ORDER[ApprovalTier.T2_ACT]) {
      tier = ApprovalTier.T2_ACT;
      escalationReasons.push("Physical force context present");
    }
  }

  return { approvalTier: tier, riskTier, escalationReasons };
}
