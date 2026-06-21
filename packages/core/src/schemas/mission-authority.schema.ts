import { z } from "zod";
import {
  ed25519PublicKeySchema,
  ed25519SignatureSchema,
  geoPolygonSchema,
  iso8601Schema,
  sha256Schema,
  uuidV7Schema,
} from "./capability-token.schema.js";

export const missionClassSchema = z.enum([
  "logistics",
  "casualty_evac",
  "civilian_rescue",
  "inspection",
  "isr",
  "force_protection",
  "counter_uas",
  "operator_supervised_effects",
]);

export const effectConstraintSchema = z.object({
  effectId: z.string().min(1).max(128),
  effectType: z.enum(["none", "non_kinetic", "kinetic"]),
  resource: z.string().min(1).max(512),
  actions: z.array(z.string().min(1).max(64)).min(1).max(16),
  maxUses: z.number().int().positive(),
  operatorAuthorizationRequired: z.boolean(),
  minimumApprovalQuorum: z.number().int().min(0).max(16),
}).strict().superRefine((effect, ctx) => {
  if (
    effect.effectType === "kinetic"
    && (!effect.operatorAuthorizationRequired || effect.minimumApprovalQuorum < 1)
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Kinetic effects require operator authorization and quorum >= 1",
    });
  }
});

export const missionApprovalPolicySchema = z.object({
  minimumQuorum: z.number().int().min(0).max(16),
  authorizedOperatorIds: z.array(ed25519PublicKeySchema).max(64),
  authorizationMaxAgeMs: z.number().int().positive(),
}).strict();

export const missionAbortConditionSchema = z.object({
  conditionId: z.string().min(1).max(128),
  signal: z.enum([
    "estop",
    "authority_revoked",
    "mission_expired",
    "geofence_exit",
    "localization_stale",
    "communications_lost",
    "autonomy_compromised",
  ]),
  response: z.enum(["terminate", "hold", "return_to_safe_state"]),
  gracePeriodMs: z.number().int().min(0).optional(),
}).strict();

export const missionManifestSchema = z.object({
  manifestId: uuidV7Schema,
  protocolVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  manifestVersion: z.number().int().positive(),
  issuer: ed25519PublicKeySchema,
  platformId: z.string().min(1).max(256),
  platformIdentity: ed25519PublicKeySchema,
  missionClass: missionClassSchema,
  validFrom: iso8601Schema,
  validUntil: iso8601Schema,
  resources: z.array(z.string().min(1).max(512)).min(1).max(128),
  actions: z.array(z.string().min(1).max(64)).min(1).max(64),
  geographicBounds: geoPolygonSchema.optional(),
  effectConstraints: z.array(effectConstraintSchema).max(64),
  approvalPolicy: missionApprovalPolicySchema,
  abortConditions: z.array(missionAbortConditionSchema).min(1).max(32),
  maxDelegationDepth: z.number().int().min(0).max(16),
  parentManifestId: uuidV7Schema.optional(),
  delegationDepth: z.number().int().min(0).max(16),
  policyHash: sha256Schema,
  signature: ed25519SignatureSchema,
}).strict().superRefine((manifest, ctx) => {
  if (Date.parse(manifest.validFrom) >= Date.parse(manifest.validUntil)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "validUntil must be later than validFrom",
      path: ["validUntil"],
    });
  }
  if (manifest.delegationDepth > manifest.maxDelegationDepth) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "delegationDepth exceeds maxDelegationDepth",
      path: ["delegationDepth"],
    });
  }
  if (manifest.delegationDepth === 0 && manifest.parentManifestId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Root manifests cannot declare parentManifestId",
      path: ["parentManifestId"],
    });
  }
  if (manifest.delegationDepth > 0 && !manifest.parentManifestId) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Delegated manifests require parentManifestId",
      path: ["parentManifestId"],
    });
  }
});

export const operatorAuthorizationSchema = z.object({
  authorizationId: uuidV7Schema,
  manifestId: uuidV7Schema,
  actionRef: z.string().min(1).max(256),
  operatorId: ed25519PublicKeySchema,
  decision: z.enum(["approve", "deny"]),
  issuedAt: iso8601Schema,
  expiresAt: iso8601Schema,
  signature: ed25519SignatureSchema,
}).strict();

export const missionActionProposalSchema = z.object({
  actionRef: z.string().min(1).max(256),
  platformId: z.string().min(1).max(256),
  platformIdentity: ed25519PublicKeySchema,
  resource: z.string().min(1).max(512),
  action: z.string().min(1).max(64),
  proposedAt: iso8601Schema,
  effectId: z.string().min(1).max(128).optional(),
  position: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }).strict().optional(),
  communicationsAvailable: z.boolean(),
  autonomyCompromised: z.boolean(),
  authorityRevoked: z.boolean(),
  operatorAuthorizations: z.array(operatorAuthorizationSchema).max(64),
}).strict();

export const missionActionOutcomeReportSchema = z.object({
  actionRef: z.string().min(1).max(256),
  manifestId: uuidV7Schema,
  platformIdentity: ed25519PublicKeySchema,
  outcome: z.enum(["completed", "failed", "aborted"]),
  completedAt: iso8601Schema,
  detailsDigest: sha256Schema.optional(),
  signature: ed25519SignatureSchema,
}).strict();

export const authorityDecisionSchema = z.object({
  actionRef: z.string().min(1).max(256),
  manifestId: uuidV7Schema,
  action: z.enum(["allow", "deny", "escalate"]),
  evaluatedAt: iso8601Schema,
  reasonCode: z.enum([
    "MANIFEST_NOT_YET_VALID",
    "MANIFEST_EXPIRED",
    "MANIFEST_SUPERSEDED",
    "WRONG_PLATFORM",
    "RESOURCE_OUT_OF_SCOPE",
    "ACTION_OUT_OF_SCOPE",
    "OUTSIDE_GEOGRAPHIC_BOUNDS",
    "EFFECT_NOT_AUTHORIZED",
    "EFFECT_USE_LIMIT_EXCEEDED",
    "ACTION_REPLAY_DETECTED",
    "OPERATOR_AUTHORIZATION_REQUIRED",
    "OPERATOR_DENIED",
    "APPROVAL_QUORUM_NOT_MET",
    "AUTHORIZATION_STALE",
    "AUTHORITY_REVOKED",
    "AUTONOMY_COMPROMISED",
    "COMMUNICATIONS_POLICY_VIOLATION",
    "ABORT_REQUIRED",
  ]).optional(),
  reason: z.string().max(1024).optional(),
  requiredApprovalQuorum: z.number().int().min(0).max(16).optional(),
  observedApprovalCount: z.number().int().min(0).max(64).optional(),
  abortResponse: z.enum(["terminate", "hold", "return_to_safe_state"]).optional(),
}).strict();

export const missionEvidenceBundleSchema = z.object({
  bundleId: uuidV7Schema,
  manifestId: uuidV7Schema,
  actionRef: z.string().min(1).max(256),
  platformId: z.string().min(1).max(256),
  authorityDecision: authorityDecisionSchema,
  operatorAuthorizations: z.array(operatorAuthorizationSchema).max(64),
  sensorProvenance: z.array(z.object({
    sourceId: z.string().min(1).max(256),
    observedAt: iso8601Schema,
    digest: sha256Schema,
  }).strict()).max(128),
  softwareVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  manifestVersion: z.number().int().positive(),
  gateReceiptEventId: uuidV7Schema,
  completionReceiptEventId: uuidV7Schema.optional(),
  outcome: z.enum(["not_executed", "completed", "failed", "aborted"]),
  generatedAt: iso8601Schema,
  previousBundleHash: sha256Schema.optional(),
  bundleHash: sha256Schema,
  signerPublicKey: ed25519PublicKeySchema,
  signature: ed25519SignatureSchema,
}).strict();

export type ValidatedMissionManifest = z.infer<typeof missionManifestSchema>;
export type ValidatedMissionActionProposal = z.infer<typeof missionActionProposalSchema>;
export type ValidatedMissionEvidenceBundle = z.infer<typeof missionEvidenceBundleSchema>;
