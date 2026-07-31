/**
 * SINT Protocol — Spatial integrity policy.
 *
 * Deployment-profile guard for fielded physical AI. Token execution envelopes
 * remain the source of truth for per-token spatial proof, while this policy
 * lets GPS-denied or degraded-perception deployments fail closed when requests
 * lack fresh localization evidence.
 */

import {
  ApprovalTier,
  RiskTier,
  DEFAULT_APPROVAL_TIMEOUT_MS,
  type PolicyDecision,
  type SintCapabilityToken,
  type SintRequest,
} from "@pshkv/core";

export interface SpatialIntegrityProfile {
  /** Deployment profile name matched against request.executionContext.deploymentProfile. */
  readonly deploymentProfile: string;
  /** Physical actions must include currentPosition. */
  readonly requireCurrentPosition?: boolean;
  /** Physical actions must include physicalContext.frameId. */
  readonly requireFrameId?: boolean;
  /** Deny when localization confidence is missing or below this floor. */
  readonly minLocalizationConfidence?: number;
  /** Escalate, rather than auto-proceed, below this confidence. */
  readonly minAutonomousLocalizationConfidence?: number;
  /** Deny when localizationObservedAt is missing or older than this age. */
  readonly maxLocalizationAgeMs?: number;
  /** Optional resource prefixes that should be treated as physical actions. */
  readonly physicalResourcePrefixes?: readonly string[];
}

export interface SpatialIntegrityPolicyContext {
  readonly requestId: string;
  readonly timestamp: string;
}

export interface SpatialIntegrityPolicyPlugin {
  evaluate(
    request: SintRequest,
    token: SintCapabilityToken,
    context: SpatialIntegrityPolicyContext,
  ): Promise<PolicyDecision | undefined> | PolicyDecision | undefined;
}

export interface DefaultSpatialIntegrityPolicyOptions {
  readonly profiles?: readonly SpatialIntegrityProfile[];
}

const DEFAULT_PHYSICAL_RESOURCE_PREFIXES = [
  "ros2:///cmd_",
  "ros2:///joint_",
  "ros2:///gripper/",
  "mavlink://",
  "px4://",
  "humanoid://",
  "open-rmf://",
  "opcua://",
] as const;

const DEFAULT_SPATIAL_INTEGRITY_PROFILES: readonly SpatialIntegrityProfile[] = [
  {
    deploymentProfile: "gps-denied-indoor",
    requireCurrentPosition: true,
    requireFrameId: true,
    minLocalizationConfidence: 0.7,
    minAutonomousLocalizationConfidence: 0.9,
    maxLocalizationAgeMs: 2_000,
  },
  {
    deploymentProfile: "underground-inspection",
    requireCurrentPosition: true,
    requireFrameId: true,
    minLocalizationConfidence: 0.75,
    minAutonomousLocalizationConfidence: 0.92,
    maxLocalizationAgeMs: 1_500,
  },
  {
    deploymentProfile: "contested-airspace",
    requireCurrentPosition: true,
    requireFrameId: true,
    minLocalizationConfidence: 0.8,
    minAutonomousLocalizationConfidence: 0.95,
    maxLocalizationAgeMs: 1_000,
  },
];

export class DefaultSpatialIntegrityPolicy implements SpatialIntegrityPolicyPlugin {
  private readonly profiles: readonly SpatialIntegrityProfile[];

  constructor(options: DefaultSpatialIntegrityPolicyOptions = {}) {
    this.profiles = options.profiles ?? DEFAULT_SPATIAL_INTEGRITY_PROFILES;
  }

  evaluate(
    request: SintRequest,
    _token: SintCapabilityToken,
    context: SpatialIntegrityPolicyContext,
  ): PolicyDecision | undefined {
    const profile = this.profileFor(request);
    if (!profile || !isPhysicalAction(request, profile)) {
      return undefined;
    }

    const physical = request.physicalContext;
    if (profile.requireCurrentPosition && !physical?.currentPosition) {
      return deny(context, "SPATIAL_POSITION_REQUIRED", "Spatial integrity requires currentPosition evidence");
    }

    if (profile.requireFrameId && !physical?.frameId) {
      return deny(context, "SPATIAL_FRAME_REQUIRED", "Spatial integrity requires a localization frameId");
    }

    if (profile.maxLocalizationAgeMs !== undefined) {
      if (!physical?.localizationObservedAt) {
        return deny(
          context,
          "SPATIAL_PROOF_STALE",
          "Spatial integrity requires localizationObservedAt for freshness checks",
        );
      }
      const observedAtMs = new Date(physical.localizationObservedAt).getTime();
      if (
        !Number.isFinite(observedAtMs)
        || Date.now() - observedAtMs > profile.maxLocalizationAgeMs
      ) {
        return deny(
          context,
          "SPATIAL_PROOF_STALE",
          `Spatial integrity proof exceeded maxLocalizationAgeMs ${profile.maxLocalizationAgeMs}`,
        );
      }
    }

    const confidence = physical?.localizationConfidence;
    if (
      profile.minLocalizationConfidence !== undefined
      && (confidence === undefined || confidence < profile.minLocalizationConfidence)
    ) {
      return deny(
        context,
        "SPATIAL_CONFIDENCE_LOW",
        `Localization confidence ${confidence ?? "missing"} is below required ${profile.minLocalizationConfidence}`,
      );
    }

    if (
      profile.minAutonomousLocalizationConfidence !== undefined
      && confidence !== undefined
      && confidence < profile.minAutonomousLocalizationConfidence
    ) {
      return escalate(
        context,
        `Localization confidence ${confidence} is below autonomous threshold ${profile.minAutonomousLocalizationConfidence}`,
      );
    }

    return undefined;
  }

  private profileFor(request: SintRequest): SpatialIntegrityProfile | undefined {
    const deploymentProfile = request.executionContext?.deploymentProfile;
    if (!deploymentProfile) {
      return undefined;
    }
    return this.profiles.find((profile) => profile.deploymentProfile === deploymentProfile);
  }
}

function isPhysicalAction(
  request: SintRequest,
  profile: SpatialIntegrityProfile,
): boolean {
  if (request.action === "subscribe" || request.action === "observe") {
    return false;
  }
  const prefixes = profile.physicalResourcePrefixes ?? DEFAULT_PHYSICAL_RESOURCE_PREFIXES;
  return prefixes.some((prefix) => request.resource.startsWith(prefix));
}

function deny(
  context: SpatialIntegrityPolicyContext,
  policyViolated: string,
  reason: string,
): PolicyDecision {
  return {
    requestId: context.requestId as any,
    timestamp: context.timestamp as any,
    action: "deny",
    denial: { reason, policyViolated },
    assignedTier: ApprovalTier.T3_COMMIT,
    assignedRisk: RiskTier.T3_IRREVERSIBLE,
  };
}

function escalate(
  context: SpatialIntegrityPolicyContext,
  reason: string,
): PolicyDecision {
  return {
    requestId: context.requestId as any,
    timestamp: context.timestamp as any,
    action: "escalate",
    escalation: {
      requiredTier: ApprovalTier.T2_ACT,
      reason,
      timeoutMs: DEFAULT_APPROVAL_TIMEOUT_MS,
      fallbackAction: "deny",
    },
    assignedTier: ApprovalTier.T2_ACT,
    assignedRisk: RiskTier.T2_STATEFUL,
  };
}
