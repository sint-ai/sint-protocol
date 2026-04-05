/**
 * SINT Protocol — Zod validation schemas for capability tokens.
 *
 * All security-critical inputs MUST be validated through these schemas
 * before processing. These schemas are the enforcement boundary.
 *
 * @module @sint/core/schemas/capability-token
 */

import { z } from "zod";

const ISO8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const HEX_REGEX = /^[a-f0-9]+$/i;
const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const iso8601Schema = z.string().regex(ISO8601_REGEX, "Must be ISO 8601 UTC with microsecond precision");
export const ed25519PublicKeySchema = z.string().regex(HEX_REGEX).length(64, "Ed25519 public key must be 64 hex chars");
export const ed25519SignatureSchema = z.string().regex(HEX_REGEX).length(128, "Ed25519 signature must be 128 hex chars");
export const sha256Schema = z.string().regex(HEX_REGEX).length(64, "SHA-256 hash must be 64 hex chars");
export const uuidV7Schema = z.string().regex(UUID_V7_REGEX, "Must be a valid UUID v7");

export const geoPolygonSchema = z.object({
  coordinates: z.array(
    z.tuple([
      z.number().min(-180).max(180), // longitude
      z.number().min(-90).max(90),   // latitude
    ])
  ).min(3, "Polygon must have at least 3 coordinate pairs"),
});

export const physicalConstraintsSchema = z.object({
  maxForceNewtons: z.number().positive().optional(),
  maxVelocityMps: z.number().positive().optional(),
  geofence: geoPolygonSchema.optional(),
  timeWindow: z.object({
    start: iso8601Schema,
    end: iso8601Schema,
  }).optional(),
  maxRepetitions: z.number().int().positive().optional(),
  requiresHumanPresence: z.boolean().optional(),
  /** Per-token rate limit: maximum calls within a sliding window. */
  rateLimit: z.object({
    maxCalls: z.number().int().positive(),
    windowMs: z.number().int().positive(),
  }).optional(),
  /** Multi-party quorum for T2/T3 approval resolutions. */
  quorum: z.object({
    required: z.number().int().positive(),
    authorized: z.array(z.string().min(1)),
  }).optional(),
  /** Maximum torque in Newton-metres. */
  maxTorqueNm: z.number().positive().optional(),
  /** Maximum jerk in m/s³. */
  maxJerkMps3: z.number().positive().optional(),
  /** Maximum angular velocity in rad/s. */
  maxAngularVelocityRps: z.number().positive().optional(),
  /** Contact force detection threshold in Newtons. */
  contactForceThresholdN: z.number().positive().optional(),
}).strict();

/** Behavioral constraints schema — runtime input validation and rate limiting. */
export const behavioralConstraintsSchema = z.object({
  /** Max tool calls per 60-second rolling window. */
  maxCallsPerMinute: z.number().int().positive().max(10_000).optional(),
  /** Allowlist regex patterns — tool input must match at least one (if provided). */
  allowedPatterns: z.array(z.string().min(1).max(512)).min(1).max(32).optional(),
  /** Denylist regex patterns — matching inputs are unconditionally blocked. */
  deniedPatterns: z.array(z.string().min(1).max(512)).min(1).max(32).optional(),
  /** Maximum payload size in bytes for any tool call using this token. */
  maxPayloadBytes: z.number().int().positive().max(104_857_600).optional(), // 100 MiB ceiling
}).strict();

export const modelConstraintsSchema = z.object({
  allowedModelIds: z.array(z.string().min(1).max(128)).min(1).max(32).optional(),
  maxModelVersion: z.string().min(1).max(64).optional(),
  modelFingerprintHash: sha256Schema.optional(),
}).strict();

export const attestationRequirementsSchema = z.object({
  minAttestationGrade: z.number().int().min(0).max(3).optional(),
  allowedTeeBackends: z.array(
    z.enum(["intel-sgx", "arm-trustzone", "amd-sev", "tpm2", "none"]),
  ).min(1).max(8).optional(),
  requireForTiers: z.array(
    z.enum(["T0_observe", "T1_prepare", "T2_act", "T3_commit"]),
  ).min(1).max(4).optional(),
}).strict();

export const verifiableComputeRequirementsSchema = z.object({
  requireForTiers: z.array(
    z.enum(["T0_observe", "T1_prepare", "T2_act", "T3_commit"]),
  ).min(1).max(4).optional(),
  allowedProofTypes: z.array(
    z.enum(["risc0-groth16", "sp1-groth16", "snark", "stark", "tee-attested"]),
  ).min(1).max(8).optional(),
  verifierRefs: z.array(z.string().min(1).max(512)).min(1).max(16).optional(),
  maxProofAgeMs: z.number().int().positive().optional(),
  requirePublicInputsHash: z.boolean().optional(),
}).strict();

export const executionEnvelopeSchema = z.object({
  corridorId: z.string().min(1).max(128).optional(),
  expiresAt: iso8601Schema.optional(),
  maxDeviationMeters: z.number().min(0).optional(),
  maxHeadingDeviationDeg: z.number().min(0).max(180).optional(),
  maxVelocityMps: z.number().positive().optional(),
  maxForceNewtons: z.number().positive().optional(),
}).strict();

export const delegationChainSchema = z.object({
  parentTokenId: uuidV7Schema.nullable(),
  depth: z.number().int().min(0).max(10),
  attenuated: z.boolean(),
});

/** Full capability token schema — validates every field. */
export const capabilityTokenSchema = z.object({
  tokenId: uuidV7Schema,
  issuer: ed25519PublicKeySchema,
  subject: ed25519PublicKeySchema,
  resource: z.string().min(1).max(512),
  actions: z.array(z.string().min(1).max(64)).min(1).max(16),
  constraints: physicalConstraintsSchema,
  modelConstraints: modelConstraintsSchema.optional(),
  attestationRequirements: attestationRequirementsSchema.optional(),
  verifiableComputeRequirements: verifiableComputeRequirementsSchema.optional(),
  executionEnvelope: executionEnvelopeSchema.optional(),
  /** Runtime behavioral constraints (input patterns, rate limits, payload size). */
  behavioralConstraints: behavioralConstraintsSchema.optional(),
  /** APS passport identifier for cross-protocol identity linkage. */
  passportId: z.string().min(1).max(256).optional(),
  /** Delegation depth in the APS chain (0 = root). */
  delegationDepth: z.number().int().min(0).max(32).optional(),
  delegationChain: delegationChainSchema,
  issuedAt: iso8601Schema,
  expiresAt: iso8601Schema,
  revocable: z.boolean(),
  revocationEndpoint: z.string().url().optional(),
  signature: ed25519SignatureSchema,
}).strict();

/** Schema for token issuance requests (no tokenId, issuedAt, or signature yet). */
export const capabilityTokenRequestSchema = z.object({
  issuer: ed25519PublicKeySchema,
  subject: ed25519PublicKeySchema,
  resource: z.string().min(1).max(512),
  actions: z.array(z.string().min(1).max(64)).min(1).max(16),
  constraints: physicalConstraintsSchema,
  modelConstraints: modelConstraintsSchema.optional(),
  attestationRequirements: attestationRequirementsSchema.optional(),
  verifiableComputeRequirements: verifiableComputeRequirementsSchema.optional(),
  executionEnvelope: executionEnvelopeSchema.optional(),
  /** Runtime behavioral constraints for this token. */
  behavioralConstraints: behavioralConstraintsSchema.optional(),
  /** APS passport identifier for cross-protocol identity linkage. */
  passportId: z.string().min(1).max(256).optional(),
  /** Delegation depth in the APS chain (0 = root). */
  delegationDepth: z.number().int().min(0).max(32).optional(),
  delegationChain: delegationChainSchema,
  expiresAt: iso8601Schema,
  revocable: z.boolean(),
  revocationEndpoint: z.string().url().optional(),
}).strict();

export type ValidatedCapabilityToken = z.infer<typeof capabilityTokenSchema>;
export type ValidatedTokenRequest = z.infer<typeof capabilityTokenRequestSchema>;
