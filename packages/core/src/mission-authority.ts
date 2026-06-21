import type {
  AuthorityDecision,
  EffectConstraint,
  MissionAbortCondition,
  MissionActionProposal,
  MissionActionOutcomeReport,
  MissionManifest,
  OperatorAuthorization,
  Result,
} from "./types/index.js";
import { err, ok } from "./types/index.js";
import { canonicalJsonStringify } from "./canonical-json.js";

export type MissionAttenuationViolation =
  | "ISSUER_CHANGED"
  | "MANIFEST_VERSION_NOT_INCREASED"
  | "MISSION_CLASS_CHANGED"
  | "PLATFORM_CHANGED"
  | "VALIDITY_EXPANDED"
  | "RESOURCE_SCOPE_EXPANDED"
  | "ACTION_SCOPE_EXPANDED"
  | "EFFECT_SCOPE_EXPANDED"
  | "APPROVAL_WEAKENED"
  | "DELEGATION_DEPTH_INVALID";

/** Canonical authority-bearing payload committed to by `policyHash`. */
export function computeMissionManifestPolicyPayload(
  manifest:
    | Omit<MissionManifest, "policyHash" | "signature">
    | MissionManifest,
): string {
  const {
    policyHash: _policyHash,
    signature: _signature,
    ...policy
  } = manifest as MissionManifest;
  return canonicalJsonStringify(policy);
}

/** Canonical payload signed by a mission-manifest issuer. */
export function computeMissionManifestSigningPayload(
  manifest: Omit<MissionManifest, "signature"> | MissionManifest,
): string {
  const { signature: _signature, ...unsigned } = manifest as MissionManifest;
  return canonicalJsonStringify(unsigned);
}

/** Canonical payload signed by an approving or denying operator. */
export function computeOperatorAuthorizationSigningPayload(
  authorization:
    | Omit<OperatorAuthorization, "signature">
    | OperatorAuthorization,
): string {
  const { signature: _signature, ...unsigned } =
    authorization as OperatorAuthorization;
  return canonicalJsonStringify(unsigned);
}

/** Canonical payload signed by the platform when reporting execution outcome. */
export function computeMissionActionOutcomeSigningPayload(
  report:
    | Omit<MissionActionOutcomeReport, "signature">
    | MissionActionOutcomeReport,
): string {
  const { signature: _signature, ...unsigned } =
    report as MissionActionOutcomeReport;
  return canonicalJsonStringify(unsigned);
}

function isSubset(child: readonly string[], parent: readonly string[]): boolean {
  const parentSet = new Set(parent);
  return child.every((value) => parentSet.has(value));
}

function effectTightens(parent: EffectConstraint, child: EffectConstraint): boolean {
  return child.effectType === parent.effectType
    && child.resource === parent.resource
    && isSubset(child.actions, parent.actions)
    && child.maxUses <= parent.maxUses
    && (!parent.operatorAuthorizationRequired || child.operatorAuthorizationRequired)
    && child.minimumApprovalQuorum >= parent.minimumApprovalQuorum;
}

export function checkMissionManifestAttenuation(
  parent: MissionManifest,
  child: MissionManifest,
): Result<true, readonly MissionAttenuationViolation[]> {
  const violations: MissionAttenuationViolation[] = [];

  if (child.issuer !== parent.issuer) violations.push("ISSUER_CHANGED");
  if (child.manifestVersion <= parent.manifestVersion) {
    violations.push("MANIFEST_VERSION_NOT_INCREASED");
  }
  if (child.missionClass !== parent.missionClass) violations.push("MISSION_CLASS_CHANGED");
  if (
    child.platformId !== parent.platformId
    || child.platformIdentity !== parent.platformIdentity
  ) violations.push("PLATFORM_CHANGED");
  if (
    Date.parse(child.validFrom) < Date.parse(parent.validFrom)
    || Date.parse(child.validUntil) > Date.parse(parent.validUntil)
  ) violations.push("VALIDITY_EXPANDED");
  if (!isSubset(child.resources, parent.resources)) violations.push("RESOURCE_SCOPE_EXPANDED");
  if (!isSubset(child.actions, parent.actions)) violations.push("ACTION_SCOPE_EXPANDED");
  if (
    child.effectConstraints.some((childEffect) => {
      const parentEffect = parent.effectConstraints.find(
        (effect) => effect.effectId === childEffect.effectId,
      );
      return !parentEffect || !effectTightens(parentEffect, childEffect);
    })
  ) violations.push("EFFECT_SCOPE_EXPANDED");
  if (
    child.approvalPolicy.minimumQuorum < parent.approvalPolicy.minimumQuorum
    || child.approvalPolicy.authorizationMaxAgeMs > parent.approvalPolicy.authorizationMaxAgeMs
    || !isSubset(
      child.approvalPolicy.authorizedOperatorIds,
      parent.approvalPolicy.authorizedOperatorIds,
    )
  ) violations.push("APPROVAL_WEAKENED");
  if (
    child.parentManifestId !== parent.manifestId
    || child.delegationDepth !== parent.delegationDepth + 1
    || child.delegationDepth > parent.maxDelegationDepth
    || child.maxDelegationDepth > parent.maxDelegationDepth
  ) violations.push("DELEGATION_DEPTH_INVALID");

  return violations.length === 0 ? ok(true) : err(violations);
}

function pointInPolygon(
  point: { latitude: number; longitude: number },
  coordinates: readonly (readonly [longitude: number, latitude: number])[],
): boolean {
  let inside = false;
  for (let i = 0, j = coordinates.length - 1; i < coordinates.length; j = i++) {
    const [xi, yi] = coordinates[i]!;
    const [xj, yj] = coordinates[j]!;
    const intersects = ((yi > point.latitude) !== (yj > point.latitude))
      && (
        point.longitude
        < ((xj - xi) * (point.latitude - yi)) / (yj - yi) + xi
      );
    if (intersects) inside = !inside;
  }
  return inside;
}

function abortFor(
  manifest: MissionManifest,
  signal: MissionAbortCondition["signal"],
): MissionAbortCondition | undefined {
  return manifest.abortConditions.find((condition) => condition.signal === signal);
}

function deny(
  manifest: MissionManifest,
  proposal: MissionActionProposal,
  evaluatedAt: string,
  reasonCode: NonNullable<AuthorityDecision["reasonCode"]>,
  reason: string,
  abort?: MissionAbortCondition,
): AuthorityDecision {
  return {
    actionRef: proposal.actionRef,
    manifestId: manifest.manifestId,
    action: "deny",
    evaluatedAt,
    reasonCode,
    reason,
    abortResponse: abort?.response,
  };
}

/**
 * Deterministic mission authority evaluation.
 *
 * Signature verification and revocation-source synchronization happen at the
 * trust boundary before calling this pure evaluator.
 */
export function evaluateMissionAuthority(params: {
  readonly manifest: MissionManifest;
  readonly proposal: MissionActionProposal;
  readonly evaluatedAt: string;
  readonly effectUseCount?: number;
}): AuthorityDecision {
  const { manifest, proposal, evaluatedAt } = params;
  const now = Date.parse(evaluatedAt);

  if (now < Date.parse(manifest.validFrom)) {
    return deny(manifest, proposal, evaluatedAt, "MANIFEST_NOT_YET_VALID", "Manifest is not yet valid");
  }
  if (now >= Date.parse(manifest.validUntil)) {
    return deny(
      manifest,
      proposal,
      evaluatedAt,
      "MANIFEST_EXPIRED",
      "Manifest has expired",
      abortFor(manifest, "mission_expired"),
    );
  }
  if (
    proposal.platformId !== manifest.platformId
    || proposal.platformIdentity !== manifest.platformIdentity
  ) {
    return deny(manifest, proposal, evaluatedAt, "WRONG_PLATFORM", "Platform identity does not match manifest");
  }
  if (proposal.authorityRevoked) {
    return deny(
      manifest,
      proposal,
      evaluatedAt,
      "AUTHORITY_REVOKED",
      "Mission authority has been revoked",
      abortFor(manifest, "authority_revoked"),
    );
  }
  if (proposal.autonomyCompromised) {
    return deny(
      manifest,
      proposal,
      evaluatedAt,
      "AUTONOMY_COMPROMISED",
      "Autonomy supervisor reported compromised authority",
      abortFor(manifest, "autonomy_compromised"),
    );
  }
  if (!proposal.communicationsAvailable) {
    const lost = abortFor(manifest, "communications_lost");
    if (lost) {
      return deny(
        manifest,
        proposal,
        evaluatedAt,
        "COMMUNICATIONS_POLICY_VIOLATION",
        "Communications-loss policy requires a safe response",
        lost,
      );
    }
  }
  if (!manifest.resources.includes(proposal.resource)) {
    return deny(manifest, proposal, evaluatedAt, "RESOURCE_OUT_OF_SCOPE", "Resource is outside manifest scope");
  }
  if (!manifest.actions.includes(proposal.action)) {
    return deny(manifest, proposal, evaluatedAt, "ACTION_OUT_OF_SCOPE", "Action is outside manifest scope");
  }
  if (
    manifest.geographicBounds
    && (
      !proposal.position
      || !pointInPolygon(proposal.position, manifest.geographicBounds.coordinates)
    )
  ) {
    return deny(
      manifest,
      proposal,
      evaluatedAt,
      "OUTSIDE_GEOGRAPHIC_BOUNDS",
      "Proposal is outside the signed geographic bounds",
      abortFor(manifest, "geofence_exit"),
    );
  }

  const effect = proposal.effectId
    ? manifest.effectConstraints.find((candidate) => candidate.effectId === proposal.effectId)
    : undefined;
  if (proposal.effectId && !effect) {
    return deny(manifest, proposal, evaluatedAt, "EFFECT_NOT_AUTHORIZED", "Effect is not present in the manifest");
  }
  if (effect) {
    if (
      effect.resource !== proposal.resource
      || !effect.actions.includes(proposal.action)
    ) {
      return deny(manifest, proposal, evaluatedAt, "EFFECT_NOT_AUTHORIZED", "Effect does not authorize this resource/action");
    }
    if ((params.effectUseCount ?? 0) >= effect.maxUses) {
      return deny(manifest, proposal, evaluatedAt, "EFFECT_USE_LIMIT_EXCEEDED", "Effect use limit has been reached");
    }
  }

  const requiredQuorum = Math.max(
    manifest.approvalPolicy.minimumQuorum,
    effect?.minimumApprovalQuorum ?? 0,
  );
  const relevant = proposal.operatorAuthorizations.filter(
    (authorization) => authorization.manifestId === manifest.manifestId
      && authorization.actionRef === proposal.actionRef
      && manifest.approvalPolicy.authorizedOperatorIds.includes(authorization.operatorId),
  );
  if (relevant.some((authorization) => authorization.decision === "deny")) {
    return deny(manifest, proposal, evaluatedAt, "OPERATOR_DENIED", "An authorized operator denied the proposal");
  }
  const freshApprovals = new Set(
    relevant
      .filter((authorization) => (
        authorization.decision === "approve"
        && Date.parse(authorization.issuedAt) <= now
        && Date.parse(authorization.expiresAt) > now
        && now - Date.parse(authorization.issuedAt)
          <= manifest.approvalPolicy.authorizationMaxAgeMs
      ))
      .map((authorization) => authorization.operatorId),
  );

  if ((effect?.operatorAuthorizationRequired || requiredQuorum > 0) && relevant.length === 0) {
    return {
      actionRef: proposal.actionRef,
      manifestId: manifest.manifestId,
      action: "escalate",
      evaluatedAt,
      reasonCode: "OPERATOR_AUTHORIZATION_REQUIRED",
      reason: "Recorded operator authorization is required",
      requiredApprovalQuorum: requiredQuorum,
      observedApprovalCount: 0,
    };
  }
  if (freshApprovals.size < requiredQuorum) {
    return {
      actionRef: proposal.actionRef,
      manifestId: manifest.manifestId,
      action: "escalate",
      evaluatedAt,
      reasonCode: relevant.length > freshApprovals.size
        ? "AUTHORIZATION_STALE"
        : "APPROVAL_QUORUM_NOT_MET",
      reason: "Operator approval quorum has not been met",
      requiredApprovalQuorum: requiredQuorum,
      observedApprovalCount: freshApprovals.size,
    };
  }

  return {
    actionRef: proposal.actionRef,
    manifestId: manifest.manifestId,
    action: "allow",
    evaluatedAt,
    requiredApprovalQuorum: requiredQuorum,
    observedApprovalCount: freshApprovals.size,
  };
}
