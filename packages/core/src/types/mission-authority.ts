/**
 * Public Mission Authority protocol types.
 *
 * SINT evaluates externally proposed actions. It does not select targets,
 * generate effects, or recommend engagements.
 */

import type {
  Ed25519PublicKey,
  Ed25519Signature,
  GeoPolygon,
  ISO8601,
  SemVer,
  SHA256,
  UUIDv7,
} from "./primitives.js";

export type MissionClass =
  | "logistics"
  | "casualty_evac"
  | "civilian_rescue"
  | "inspection"
  | "isr"
  | "force_protection"
  | "counter_uas"
  | "operator_supervised_effects";

export type MissionEffectType =
  | "none"
  | "non_kinetic"
  | "kinetic";

export interface EffectConstraint {
  /** Stable identifier referenced by an externally proposed action. */
  readonly effectId: string;
  /** Classification only; SINT does not generate or select the effect. */
  readonly effectType: MissionEffectType;
  /** Resource URI on which this effect may be requested. */
  readonly resource: string;
  /** Allowlisted action names for the effect. */
  readonly actions: readonly string[];
  /** Hard upper bound on uses under this manifest. */
  readonly maxUses: number;
  /** Every kinetic effect must require recorded operator authorization. */
  readonly operatorAuthorizationRequired: boolean;
  /** Minimum distinct approving operators. */
  readonly minimumApprovalQuorum: number;
}

export interface MissionApprovalPolicy {
  readonly minimumQuorum: number;
  readonly authorizedOperatorIds: readonly Ed25519PublicKey[];
  readonly authorizationMaxAgeMs: number;
}

export interface MissionAbortCondition {
  readonly conditionId: string;
  readonly signal:
    | "estop"
    | "authority_revoked"
    | "mission_expired"
    | "geofence_exit"
    | "localization_stale"
    | "communications_lost"
    | "autonomy_compromised";
  readonly response: "terminate" | "hold" | "return_to_safe_state";
  /** Optional grace period. E-stop is always immediate regardless of this value. */
  readonly gracePeriodMs?: number;
}

export interface MissionManifest {
  readonly manifestId: UUIDv7;
  readonly protocolVersion: SemVer;
  readonly manifestVersion: number;
  readonly issuer: Ed25519PublicKey;
  readonly platformId: string;
  readonly platformIdentity: Ed25519PublicKey;
  readonly missionClass: MissionClass;
  readonly validFrom: ISO8601;
  readonly validUntil: ISO8601;
  readonly resources: readonly string[];
  readonly actions: readonly string[];
  readonly geographicBounds?: GeoPolygon;
  readonly effectConstraints: readonly EffectConstraint[];
  readonly approvalPolicy: MissionApprovalPolicy;
  readonly abortConditions: readonly MissionAbortCondition[];
  readonly maxDelegationDepth: number;
  readonly parentManifestId?: UUIDv7;
  readonly delegationDepth: number;
  readonly policyHash: SHA256;
  readonly signature: Ed25519Signature;
}

export interface MissionManifestRevocation {
  readonly manifestId: UUIDv7;
  readonly reason: string;
  readonly revokedBy: string;
  readonly revokedAt: ISO8601;
}

export interface OperatorAuthorization {
  readonly authorizationId: UUIDv7;
  readonly manifestId: UUIDv7;
  readonly actionRef: string;
  readonly operatorId: Ed25519PublicKey;
  readonly decision: "approve" | "deny";
  readonly issuedAt: ISO8601;
  readonly expiresAt: ISO8601;
  readonly signature: Ed25519Signature;
}

export interface MissionActionProposal {
  readonly actionRef: string;
  readonly platformId: string;
  readonly platformIdentity: Ed25519PublicKey;
  readonly resource: string;
  readonly action: string;
  readonly proposedAt: ISO8601;
  readonly effectId?: string;
  readonly position?: {
    readonly latitude: number;
    readonly longitude: number;
  };
  readonly communicationsAvailable: boolean;
  readonly autonomyCompromised: boolean;
  readonly authorityRevoked: boolean;
  readonly operatorAuthorizations: readonly OperatorAuthorization[];
}

export interface MissionActionOutcomeReport {
  readonly actionRef: string;
  readonly manifestId: UUIDv7;
  readonly platformIdentity: Ed25519PublicKey;
  readonly outcome: "completed" | "failed" | "aborted";
  readonly completedAt: ISO8601;
  readonly detailsDigest?: SHA256;
  readonly signature: Ed25519Signature;
}

export type AuthorityDenialCode =
  | "MANIFEST_NOT_YET_VALID"
  | "MANIFEST_EXPIRED"
  | "MANIFEST_SUPERSEDED"
  | "WRONG_PLATFORM"
  | "RESOURCE_OUT_OF_SCOPE"
  | "ACTION_OUT_OF_SCOPE"
  | "OUTSIDE_GEOGRAPHIC_BOUNDS"
  | "EFFECT_NOT_AUTHORIZED"
  | "EFFECT_USE_LIMIT_EXCEEDED"
  | "ACTION_REPLAY_DETECTED"
  | "OPERATOR_AUTHORIZATION_REQUIRED"
  | "OPERATOR_DENIED"
  | "APPROVAL_QUORUM_NOT_MET"
  | "AUTHORIZATION_STALE"
  | "AUTHORITY_REVOKED"
  | "AUTONOMY_COMPROMISED"
  | "COMMUNICATIONS_POLICY_VIOLATION"
  | "ABORT_REQUIRED";

export interface AuthorityDecision {
  readonly actionRef: string;
  readonly manifestId: UUIDv7;
  readonly action: "allow" | "deny" | "escalate";
  readonly evaluatedAt: ISO8601;
  readonly reasonCode?: AuthorityDenialCode;
  readonly reason?: string;
  readonly requiredApprovalQuorum?: number;
  readonly observedApprovalCount?: number;
  readonly abortResponse?: MissionAbortCondition["response"];
}

export interface MissionEvidenceBundle {
  readonly bundleId: UUIDv7;
  readonly manifestId: UUIDv7;
  readonly actionRef: string;
  readonly platformId: string;
  readonly authorityDecision: AuthorityDecision;
  readonly operatorAuthorizations: readonly OperatorAuthorization[];
  readonly sensorProvenance: readonly {
    readonly sourceId: string;
    readonly observedAt: ISO8601;
    readonly digest: SHA256;
  }[];
  readonly softwareVersion: SemVer;
  readonly manifestVersion: number;
  readonly gateReceiptEventId: UUIDv7;
  readonly completionReceiptEventId?: UUIDv7;
  readonly outcome: "not_executed" | "completed" | "failed" | "aborted";
  readonly generatedAt: ISO8601;
  readonly previousBundleHash?: SHA256;
  readonly bundleHash: SHA256;
  readonly signerPublicKey: Ed25519PublicKey;
  readonly signature: Ed25519Signature;
}
