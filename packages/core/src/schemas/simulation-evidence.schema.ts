import { z } from "zod";
import { ApprovalTier } from "../types/policy.js";
import {
  ed25519PublicKeySchema,
  ed25519SignatureSchema,
  iso8601Schema,
  sha256Schema,
  uuidV7Schema,
} from "./capability-token.schema.js";

export const simulationWorldSnapshotSchema = z.object({
  digest: sha256Schema,
  observedAt: iso8601Schema,
  validUntil: iso8601Schema,
  stateEpoch: z.string().min(1).max(128).optional(),
  uncertainty: z.number().min(0).max(1).optional(),
}).strict();

export const simulationRuntimeIdentitySchema = z.object({
  backend: z.string().min(1).max(128),
  version: z.string().min(1).max(128),
  modelDigest: sha256Schema,
  imageDigest: sha256Schema.optional(),
}).strict();

export const simulationScenarioEvidenceSchema = z.object({
  scenarioSetDigest: sha256Schema,
  runCount: z.number().int().positive().max(1_000_000),
  coverage: z.number().min(0).max(1).optional(),
  seeds: z.array(z.number().int().nonnegative()).max(10_000).optional(),
}).strict();

export const simulationSafetyResultSchema = z.object({
  outcome: z.enum(["pass", "fail", "indeterminate"]),
  collisions: z.number().int().nonnegative(),
  safetyZoneViolations: z.number().int().nonnegative(),
  maxForceNewtons: z.number().nonnegative().optional(),
  maxVelocityMps: z.number().nonnegative().optional(),
  maxTorqueNm: z.number().nonnegative().optional(),
  maxJerkMps3: z.number().nonnegative().optional(),
  maxAngularVelocityRps: z.number().nonnegative().optional(),
  minClearanceMeters: z.number().nonnegative().optional(),
  assumptions: z.array(z.string().min(1).max(512)).max(64).optional(),
  unsupportedPhenomena: z.array(z.string().min(1).max(512)).max(64).optional(),
}).strict();

export const simulationEvidenceGradeSchema = z.enum([
  "deterministic",
  "physics",
  "digital-twin",
]);

export const simulationSubjectBindingsSchema = z.object({
  robotId: z.string().min(1).max(128).optional(),
  toolId: z.string().min(1).max(128).optional(),
  payloadDigest: sha256Schema.optional(),
  controllerId: z.string().min(1).max(128).optional(),
  cellId: z.string().min(1).max(128).optional(),
  policyDigest: sha256Schema.optional(),
}).strict();

export const simulationEvidenceRequirementSchema = z.object({
  minEvidenceGrade: simulationEvidenceGradeSchema,
  minScenarioRuns: z.number().int().positive().max(1_000_000).optional(),
  minScenarioCoverage: z.number().min(0).max(1).optional(),
  maxWorldUncertainty: z.number().min(0).max(1).optional(),
  allowedBackends: z.array(z.string().min(1).max(128)).max(128).optional(),
  requiredBindings: z.array(z.enum([
    "robotId",
    "toolId",
    "payloadDigest",
    "controllerId",
    "cellId",
    "policyDigest",
  ])).max(6).optional(),
  expectedBindings: simulationSubjectBindingsSchema.optional(),
  minApprovalQuorum: z.number().int().positive().max(100).optional(),
  reason: z.string().min(1).max(512).optional(),
}).strict();

export const effectPlanSchema = z.object({
  requestDigest: sha256Schema,
  effectPlanDigest: sha256Schema,
  tokenDigest: sha256Schema,
  resource: z.string().min(1).max(512),
  action: z.string().min(1).max(64),
  params: z.record(z.unknown()),
}).strict();

export const simulationPreflightSchema = z.object({
  kind: z.literal("simulation-preflight"),
  authorizesExecution: z.literal(false),
  assignedTier: z.nativeEnum(ApprovalTier),
  effectPlan: effectPlanSchema,
  requirement: simulationEvidenceRequirementSchema.optional(),
}).strict();

export const effectSimulationErrorSchema = z.object({
  code: z.enum([
    "INVALID_PREFLIGHT",
    "UNSUPPORTED_EVIDENCE_GRADE",
    "WORLD_SNAPSHOT_REQUIRED",
    "WORLD_SNAPSHOT_STALE",
    "ARTIFACT_PERSISTENCE_FAILED",
    "EVIDENCE_LEDGER_WRITE_FAILED",
    "SIMULATOR_MISCONFIGURED",
    "SIMULATION_FAILED",
  ]),
  message: z.string().min(1).max(2048),
  retryable: z.boolean(),
}).strict();

export const effectSimulationRequestSchema = z.object({
  preflight: simulationPreflightSchema,
  worldSnapshot: simulationWorldSnapshotSchema,
}).strict();

export const simulationEvidenceReceiptSchema = z.object({
  schemaVersion: z.literal("2.0.0"),
  receiptId: uuidV7Schema,
  evidenceGrade: simulationEvidenceGradeSchema,
  requestDigest: sha256Schema,
  effectPlanDigest: sha256Schema,
  tokenDigest: sha256Schema,
  resource: z.string().min(1).max(512),
  action: z.string().min(1).max(64),
  bindings: simulationSubjectBindingsSchema.optional(),
  worldSnapshot: simulationWorldSnapshotSchema,
  simulator: simulationRuntimeIdentitySchema,
  scenarios: simulationScenarioEvidenceSchema,
  result: simulationSafetyResultSchema,
  generatedAt: iso8601Schema,
  expiresAt: iso8601Schema,
  nonce: z.string().min(16).max(256),
  artifactDigest: sha256Schema,
  signerPublicKey: ed25519PublicKeySchema,
  signature: ed25519SignatureSchema,
}).strict();

export type ValidatedSimulationEvidenceReceipt = z.infer<typeof simulationEvidenceReceiptSchema>;
