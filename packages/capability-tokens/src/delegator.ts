/**
 * SINT Protocol — Capability Token Delegator.
 *
 * Manages delegation chains — creating child tokens that are
 * attenuated (reduced) versions of parent tokens. Enforces
 * maximum delegation depth (default: 3 hops).
 *
 * Key invariant: A delegated token can NEVER have more permissions
 * than its parent. Delegation can only attenuate (reduce), never amplify.
 *
 * @module @sint/gate-capability-tokens/delegator
 */

import {
  type CapabilityTokenError,
  type Ed25519PublicKey,
  type ISO8601,
  MAX_DELEGATION_DEPTH,
  type Result,
  type SintCapabilityToken,
  type SintPhysicalConstraints,
  err,
} from "@sint/core";
import { issueCapabilityToken } from "./issuer.js";
import { validateCapabilityToken } from "./validator.js";

/**
 * Parameters for delegating a capability token.
 */
export interface DelegationParams {
  /** The new agent receiving the delegated capability. */
  readonly newSubject: Ed25519PublicKey;

  /** Optional: Restrict to a subset of the parent's actions. */
  readonly restrictActions?: readonly string[];

  /** Optional: Tighten physical constraints (can only reduce, never increase). */
  readonly tightenConstraints?: Partial<SintPhysicalConstraints>;

  /** Optional: Override expiry (must be <= parent's expiry). */
  readonly expiresAt?: ISO8601;
}

/**
 * Compute attenuated constraints — takes the minimum (most restrictive)
 * of the parent's and the requested constraints.
 * Pure function.
 */
function attenuateConstraints(
  parent: SintPhysicalConstraints,
  tighten?: Partial<SintPhysicalConstraints>,
): SintPhysicalConstraints {
  if (!tighten) return { ...parent };

  return {
    maxForceNewtons: minOptional(parent.maxForceNewtons, tighten.maxForceNewtons),
    maxVelocityMps: minOptional(parent.maxVelocityMps, tighten.maxVelocityMps),
    geofence: tighten.geofence ?? parent.geofence,
    timeWindow: parent.timeWindow, // Cannot widen time window
    maxRepetitions: minOptional(parent.maxRepetitions, tighten.maxRepetitions),
    requiresHumanPresence:
      parent.requiresHumanPresence === true ? true : tighten.requiresHumanPresence,
    rateLimit: parent.rateLimit,
    quorum: parent.quorum,
  };
}

/** Return the smaller of two optional numbers. */
function minOptional(a?: number, b?: number): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.min(a, b);
}

/**
 * Delegate a capability token — create a child token with attenuated permissions.
 *
 * The delegated token:
 * - Can only have a subset of the parent's actions
 * - Can only have tighter (never looser) physical constraints
 * - Must expire at or before the parent's expiry
 * - Increments the delegation depth by 1
 * - Fails if delegation depth would exceed MAX_DELEGATION_DEPTH
 *
 * @param parentToken - The parent token being delegated
 * @param params - Delegation parameters
 * @param delegatorPrivateKey - The delegator's (parent subject's) private key
 * @returns Result containing the new delegated token or an error
 *
 * @example
 * ```ts
 * const result = delegateCapabilityToken(
 *   parentToken,
 *   {
 *     newSubject: "newAgentPubKey...",
 *     restrictActions: ["subscribe"],  // Reduce from ["publish", "subscribe"]
 *     tightenConstraints: { maxVelocityMps: 0.3 },  // Reduce from 0.5
 *   },
 *   delegatorPrivateKey
 * );
 * ```
 */
export function delegateCapabilityToken(
  parentToken: SintCapabilityToken,
  params: DelegationParams,
  delegatorPrivateKey: string,
): Result<SintCapabilityToken, CapabilityTokenError> {
  // Check delegation depth limit
  const newDepth = parentToken.delegationChain.depth + 1;
  if (newDepth > MAX_DELEGATION_DEPTH) {
    return err("DELEGATION_DEPTH_EXCEEDED");
  }

  // Validate parent token is still valid (signature + expiry)
  const parentValidation = validateCapabilityToken(parentToken, {
    resource: parentToken.resource,
    action: parentToken.actions[0]!,
  });
  if (!parentValidation.ok) {
    return parentValidation;
  }

  // Determine actions — can only be a subset
  const delegatedActions = params.restrictActions
    ? params.restrictActions.filter((a) => parentToken.actions.includes(a))
    : [...parentToken.actions];

  if (delegatedActions.length === 0) {
    return err("INSUFFICIENT_PERMISSIONS");
  }

  // Determine expiry — must be <= parent's expiry
  let expiresAt = parentToken.expiresAt;
  if (params.expiresAt) {
    const requestedExpiry = new Date(params.expiresAt);
    const parentExpiry = new Date(parentToken.expiresAt);
    if (requestedExpiry > parentExpiry) {
      // Cannot extend expiry beyond parent — use parent's expiry
      expiresAt = parentToken.expiresAt;
    } else {
      expiresAt = params.expiresAt;
    }
  }

  // Attenuate constraints
  const constraints = attenuateConstraints(
    parentToken.constraints,
    params.tightenConstraints,
  );

  // Issue the delegated token
  return issueCapabilityToken(
    {
      issuer: parentToken.subject, // The delegator becomes the issuer
      subject: params.newSubject,
      resource: parentToken.resource,
      actions: delegatedActions,
      constraints,
      modelConstraints: parentToken.modelConstraints,
      attestationRequirements: parentToken.attestationRequirements,
      verifiableComputeRequirements: parentToken.verifiableComputeRequirements,
      executionEnvelope: parentToken.executionEnvelope,
      delegationChain: {
        parentTokenId: parentToken.tokenId,
        depth: newDepth,
        attenuated: true,
      },
      expiresAt,
      revocable: parentToken.revocable,
      revocationEndpoint: parentToken.revocationEndpoint,
    },
    delegatorPrivateKey,
  );
}
