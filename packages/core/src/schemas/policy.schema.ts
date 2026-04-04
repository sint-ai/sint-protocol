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

export const physicalContextSchema = z.object({
  humanDetected: z.boolean().optional(),
  currentForceNewtons: z.number().min(0).optional(),
  currentVelocityMps: z.number().min(0).optional(),
  currentPosition: z.object({
    x: z.number(),
    y: z.number(),
    z: z.number(),
  }).optional(),
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
  expiresAt: iso8601Schema,
  maxDeviationMeters: z.number().min(0).optional(),
  maxHeadingDeviationDeg: z.number().min(0).max(180).optional(),
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
}).strict();

export const sintRequestSchema = z.object({
  requestId: uuidV7Schema,
  timestamp: iso8601Schema,
  agentId: ed25519PublicKeySchema,
  tokenId: uuidV7Schema,
  resource: z.string().min(1).max(512),
  action: z.string().min(1).max(64),
  params: z.record(z.unknown()),
  physicalContext: physicalContextSchema.optional(),
  recentActions: z.array(z.string()).optional(),
  executionContext: executionContextSchema.optional(),
}).strict();

export type ValidatedSintRequest = z.infer<typeof sintRequestSchema>;
