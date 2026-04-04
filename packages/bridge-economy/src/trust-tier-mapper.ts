/**
 * SINT Protocol — Trust Level to Approval Tier mapper.
 *
 * Maps the product API's trust levels to SINT approval tiers:
 *
 *   unrestricted → T0_OBSERVE  (auto-approve)
 *   low_risk     → T1_PREPARE  (auto with audit)
 *   medium_risk  → T2_ACT      (requires review)
 *   high_risk    → T3_COMMIT   (requires human)
 *   blocked      → deny        (hard block)
 *
 * The `mergedTier` function takes the higher (more restrictive)
 * of the security tier and the trust tier.
 *
 * @module @sint/bridge-economy/trust-tier-mapper
 */

import { ApprovalTier } from "@sint/core";
import type { EconomyTrustLevel } from "./interfaces.js";

/** Numeric tier ordering for comparison (higher = more restrictive). */
const TIER_ORDER: Record<string, number> = {
  [ApprovalTier.T0_OBSERVE]: 0,
  [ApprovalTier.T1_PREPARE]: 1,
  [ApprovalTier.T2_ACT]: 2,
  [ApprovalTier.T3_COMMIT]: 3,
};

/**
 * Map an economy trust level to a SINT approval tier.
 *
 * @param trustLevel - Trust level from the economy service
 * @returns The corresponding approval tier, or null if blocked
 *
 * @example
 * ```ts
 * mapTrustLevelToApprovalTier("low_risk");  // ApprovalTier.T1_PREPARE
 * mapTrustLevelToApprovalTier("blocked");   // null (deny)
 * ```
 */
export function mapTrustLevelToApprovalTier(
  trustLevel: EconomyTrustLevel,
): ApprovalTier | null {
  switch (trustLevel) {
    case "unrestricted":
      return ApprovalTier.T0_OBSERVE;
    case "low_risk":
      return ApprovalTier.T1_PREPARE;
    case "medium_risk":
      return ApprovalTier.T2_ACT;
    case "high_risk":
      return ApprovalTier.T3_COMMIT;
    case "blocked":
      return null;
  }
}

/**
 * Merge a security tier with a trust tier, returning the more restrictive one.
 *
 * This ensures that trust evaluation can only escalate (never relax) the
 * tier assigned by the security layer.
 *
 * @param securityTier - The tier assigned by PolicyGateway's security logic
 * @param trustTier - The tier derived from trust evaluation
 * @returns The more restrictive (higher) of the two tiers
 *
 * @example
 * ```ts
 * mergedTier(ApprovalTier.T0_OBSERVE, ApprovalTier.T3_COMMIT);
 * // → ApprovalTier.T3_COMMIT
 * ```
 */
export function mergedTier(
  securityTier: ApprovalTier,
  trustTier: ApprovalTier,
): ApprovalTier {
  const securityOrder = TIER_ORDER[securityTier] ?? 0;
  const trustOrder = TIER_ORDER[trustTier] ?? 0;

  if (trustOrder > securityOrder) {
    return trustTier;
  }
  return securityTier;
}

/**
 * Check whether a trust tier would escalate a security tier.
 *
 * @param securityTier - Current security tier
 * @param trustTier - Trust-derived tier
 * @returns true if trust would escalate (make more restrictive)
 */
export function wouldEscalate(
  securityTier: ApprovalTier,
  trustTier: ApprovalTier,
): boolean {
  const securityOrder = TIER_ORDER[securityTier] ?? 0;
  const trustOrder = TIER_ORDER[trustTier] ?? 0;
  return trustOrder > securityOrder;
}
