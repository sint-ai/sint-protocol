/**
 * SINT Protocol — Zod validation schemas for policy gateway requests.
 *
 * @module @sint/core/schemas/policy
 */

import { z } from "zod";
import {
  ed25519PublicKeySchema,
  iso8601Schema,
  uuidV7Schema,
} from "./capability-token.schema.js";
import { humanAuthorityProofSchema } from "./authority.schema.js";
import { deploymentEvidenceRefSchema } from "./deployment-envelope.schema.js";
import { manufacturingExecutionContextSchema } from "./manufacturing-execution.schema.js";
import { simulationEvidenceReceiptSchema } from "./simulation-evidence.schema.js";
import { vlaActionChunkEnvelopeSchema, vlaMemoryEvidenceRefSchema, vlaTaskIntentEnvelopeSchema } from "./vla.schema.js";
import { perceptionEvidenceSchema } from "./hazardous-energy.schema.js";

export const physicalContextSchema = z.object({
  humanDetected: z.boolean().optional(),
  currentForceNewtons: z.number().min(0).optional(),
  currentVelocityMps: z.number().min(0).optional(),
  currentTorqueNm: z.number().min(0).optional(),
  currentJerkMps3: z.number().min(0).optional(),
  currentAngularVelocityRps: z.number().min(0).optional(),
  nearestObstacleMeters: z.number().min(0).optional(),
  trajectoryNovel: z.boolean().optional(),
  jointStates: z.array(z.object({
    joint: z.string().min(1).max(128),
    positionRad: z.number().optional(),
    velocityRps: z.number().optional(),
    effortNm: z.number().optional(),
  }).strict()).optional(),
  currentPosition: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }).optional(),
  currentHeadingDeg: z.number().min(-360).max(360).optional(),
  localizationConfidence: z.number().min(0).max(1).optional(),
  localizationObservedAt: iso8601Schema.optional(),
  frameId: z.string().min(1).max(128).optional(),
}).strict();

export const consequenceContextSchema = z.object({
  reversibility: z.enum(["reversible", "compensatable", "irreversible"]),
  affectedEntities: z.number().int().nonnegative().optional(),
  monetaryValue: z.object({
    amount: z.number().nonnegative(),
    currency: z.string().regex(/^[A-Z]{3}$/),
  }).strict().optional(),
  operationalDurationMs: z.number().int().nonnegative().optional(),
  propagationDepth: z.number().int().nonnegative().optional(),
}).strict();

export const executorIdentitySchema = z.object({
  runtimeId: z.string().min(1).max(128).optional(),
  nodeId: z.string().min(1).max(128).optional(),
  did: z.string().min(1).max(256).optional(),
  host: z.string().min(1).max(256).optional(),
}).strict();

export const modelRuntimeContextSchema = z.object({
  modelId: z.string().min(1).max(128).optional(),
  modelVersion: z.string().min(1).max(64).optional(),
  modelFingerprintHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  checkpointDigest: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  policyConfigDigest: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  normalizationDigest: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  actionTransformDigest: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  actionSpaceDigest: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  embodimentId: z.string().min(1).max(128).optional(),
  calibrationDigest: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  sensorLayoutDigest: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  datasetDigest: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  trainingRecipeDigest: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  promotionEvidenceDigest: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  rollbackCheckpointDigest: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
}).strict();

export const attestationContextSchema = z.object({
  grade: z.number().int().min(0).max(3).optional(),
  teeBackend: z.enum(["intel-sgx", "arm-trustzone", "amd-sev", "tpm2", "none"]).optional(),
  quoteRef: z.string().min(1).max(512).optional(),
}).strict();

export const verifiableComputeContextSchema = z.object({
  proofType: z.enum(["risc0-groth16", "sp1-groth16", "snark", "stark", "tee-attested"]).optional(),
  proofRef: z.string().min(1).max(512).optional(),
  proofHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  publicInputsHash: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
  generatedAt: iso8601Schema.optional(),
  verifierRef: z.string().min(1).max(512).optional(),
}).strict();

export const hardwareSafetyContextSchema = z.object({
  permitState: z.enum(["granted", "denied", "unknown", "stale"]).optional(),
  interlockState: z.enum(["closed", "open", "fault", "unknown"]).optional(),
  estopState: z.enum(["clear", "triggered", "unknown"]).optional(),
  observedAt: iso8601Schema.optional(),
  controllerId: z.string().min(1).max(128).optional(),
}).strict();

export const preapprovedCorridorSchema = z.object({
  corridorId: z.string().min(1).max(128),
  missionType: z.enum([
    "logistics",
    "casualty_evac",
    "civilian_rescue",
    "inspection",
    "security",
    "combat",
  ]).optional(),
  expiresAt: iso8601Schema,
  maxDeviationMeters: z.number().min(0).optional(),
  maxHeadingDeviationDeg: z.number().min(0).max(180).optional(),
}).strict();

export const factoryReceiptChainEntrySchema = z.object({
  step: z.string().min(1).max(128),
  eventType: z.string().min(1).max(128),
  digest: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
  previousDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/i).nullable(),
}).strict();

export const executionContextSchema = z.object({
  deploymentProfile: z.string().min(1).max(128).optional(),
  siteId: z.string().min(1).max(128).optional(),
  bridgeId: z.string().min(1).max(128).optional(),
  bridgeProtocol: z.string().min(1).max(64).optional(),
  executor: executorIdentitySchema.optional(),
  model: modelRuntimeContextSchema.optional(),
  attestation: attestationContextSchema.optional(),
  verifiableCompute: verifiableComputeContextSchema.optional(),
  hardwareSafety: hardwareSafetyContextSchema.optional(),
  preapprovedCorridor: preapprovedCorridorSchema.optional(),
  factoryReceiptChain: z.array(factoryReceiptChainEntrySchema).max(32).optional(),
  humanAuthority: humanAuthorityProofSchema.optional(),
  deploymentEvidence: z.array(deploymentEvidenceRefSchema).max(32).optional(),
  manufacturingExecution: manufacturingExecutionContextSchema.optional(),
  simulationEvidence: simulationEvidenceReceiptSchema.optional(),
  vlaActionChunk: vlaActionChunkEnvelopeSchema.optional(),
  vlaTaskIntent: vlaTaskIntentEnvelopeSchema.optional(),
  vlaMemoryEvidence: z.array(vlaMemoryEvidenceRefSchema).max(128).optional(),
  perceptionEvidence: perceptionEvidenceSchema.optional(),
}).strict();

export const sintRequestSchema = z.object({
  requestId: uuidV7Schema,
  timestamp: iso8601Schema,
  agentId: ed25519PublicKeySchema,
  tokenId: uuidV7Schema,
  resource: z.string().min(1).max(512),
  action: z.string().min(1).max(64),
  params: z.record(z.string(), z.unknown()),
  physicalContext: physicalContextSchema.optional(),
  consequenceContext: consequenceContextSchema.optional(),
  recentActions: z.array(z.string()).optional(),
  mcpPolicy: z.object({
    requireApproval: z.boolean().optional(),
    maxTier: z.enum(["T0_observe", "T1_prepare", "T2_act", "T3_commit"]).optional(),
  }).strict().optional(),
  mcpAnnotations: z.object({
    readOnlyHint: z.boolean().optional(),
    destructiveHint: z.boolean().optional(),
    openWorldHint: z.boolean().optional(),
    idempotentHint: z.boolean().optional(),
  }).strict().optional(),
  executionContext: executionContextSchema.optional(),
}).strict();

export type ValidatedSintRequest = z.infer<typeof sintRequestSchema>;
