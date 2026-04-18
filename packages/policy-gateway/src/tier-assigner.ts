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
} from "@sint-ai/core";
import type { AgentTrustLevel } from "@sint-ai/core";

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
 * Simple glob matching for resource patterns.
 * Supports:
 * - Exact match: "ros2:///cmd_vel"
 * - Prefix wildcard: "ros2:///camera/*"
 * - Double wildcard: "mcp://*"
 */
function matchesPattern(pattern: string, resource: string): boolean {
  if (pattern === resource) return true;

  // Simple trailing wildcard — only when no earlier wildcards exist
  const firstStar = pattern.indexOf("*");
  if (firstStar >= 0 && firstStar === pattern.length - 1) {
    // Single trailing * — prefix match
    const prefix = pattern.slice(0, -1);
    return resource.startsWith(prefix);
  }

  if (pattern.endsWith("/*") && !pattern.slice(0, -2).includes("*")) {
    // Single trailing /* — prefix match
    const prefix = pattern.slice(0, -1);
    return resource.startsWith(prefix);
  }

  // General glob with wildcards — use regex
  if (pattern.includes("*")) {
    const regex = new RegExp(
      "^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + "$",
    );
    return regex.test(resource);
  }

  return false;
}

/**
 * Decode URI path fragments when resources are percent-encoded by bridges.
 *
 * Example:
 *   opcua://plc-1/ns%3D2%3Bs%3DLine1%2FSafety%2FInterlock
 * becomes:
 *   opcua://plc-1/ns=2;s=Line1/Safety/Interlock
 */
function decodeResource(resource: string): string {
  const schemeIdx = resource.indexOf("://");
  if (schemeIdx < 0) {
    return resource;
  }

  const prefix = resource.slice(0, schemeIdx + 3);
  const remainder = resource.slice(schemeIdx + 3);

  try {
    return `${prefix}${decodeURIComponent(remainder)}`;
  } catch {
    return resource;
  }
}

/** Match a resource against a rule using raw + decoded + case-insensitive forms. */
function matchesRuleResource(pattern: string, resource: string): boolean {
  if (matchesPattern(pattern, resource)) {
    return true;
  }

  const decoded = decodeResource(resource);
  if (decoded !== resource && matchesPattern(pattern, decoded)) {
    return true;
  }

  const loweredPattern = pattern.toLowerCase();
  const loweredResource = resource.toLowerCase();
  if (matchesPattern(loweredPattern, loweredResource)) {
    return true;
  }

  const loweredDecoded = decoded.toLowerCase();
  if (loweredDecoded !== loweredResource && matchesPattern(loweredPattern, loweredDecoded)) {
    return true;
  }

  return false;
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

  // Find the most specific matching rule
  let bestRule: TierAssignmentRule | undefined;
  let bestSpecificity = -1;

  for (const rule of rules) {
    if (
      matchesRuleResource(rule.resourcePattern, request.resource) &&
      rule.actions.includes(request.action)
    ) {
      // More specific patterns (longer, fewer wildcards) win
      const specificity = rule.resourcePattern.replace(/\*/g, "").length;
      if (specificity > bestSpecificity) {
        bestSpecificity = specificity;
        bestRule = rule;
      }
    }
  }

  // Default to PREPARE if no rule matches
  let tier = bestRule?.baseTier ?? ApprovalTier.T1_PREPARE;
  const riskTier = bestRule?.baseRisk ?? ("T1_write_low" as RiskTier);

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
