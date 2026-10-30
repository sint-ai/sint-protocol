import { z } from "zod";

const ISO8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const HEX_REGEX = /^[a-f0-9]+$/i;
const iso8601Schema = z.string().regex(ISO8601_REGEX, "Must be ISO 8601 UTC with microsecond precision");
const sha256Schema = z.string().regex(HEX_REGEX).length(64, "SHA-256 hash must be 64 hex chars");

export const proofFreshnessRequirementSchema = z.object({
  maxProofAgeMs: z.number().int().positive().optional(),
  requireObservedAt: z.boolean().optional(),
}).strict();

export const contextualBindingSchema = z.object({
  deploymentProfile: z.string().min(1).max(128).optional(),
  siteId: z.string().min(1).max(128).optional(),
  bridgeId: z.string().min(1).max(128).optional(),
  bridgeProtocol: z.string().min(1).max(64).optional(),
  robotId: z.string().min(1).max(128).optional(),
  fleetId: z.string().min(1).max(128).optional(),
  controllerId: z.string().min(1).max(128).optional(),
  zoneId: z.string().min(1).max(128).optional(),
  resource: z.string().min(1).max(512).optional(),
  action: z.string().min(1).max(64).optional(),
}).strict();

export const requiredEvidenceRefSchema = z.object({
  evidenceType: z.string().min(1).max(128),
  evidenceRef: z.string().min(1).max(512),
  proofHash: sha256Schema.optional(),
  verifierRef: z.string().min(1).max(512).optional(),
  observedAt: iso8601Schema.optional(),
  maxAgeMs: z.number().int().positive().optional(),
}).strict();

export const deploymentEvidenceRefSchema = requiredEvidenceRefSchema.extend({
  observedAt: iso8601Schema,
});

export const deploymentEnvelopeSchema = z.object({
  envelopeId: z.string().min(1).max(128).optional(),
  contextualBinding: contextualBindingSchema.optional(),
  proofFreshness: proofFreshnessRequirementSchema.optional(),
  requiredEvidenceRefs: z.array(requiredEvidenceRefSchema).max(32).optional(),
  allowedVerifiers: z.array(z.string().min(1).max(512)).min(1).max(32).optional(),
}).strict();

export type ValidatedDeploymentEnvelope = z.infer<typeof deploymentEnvelopeSchema>;
export type ValidatedDeploymentEvidenceRef = z.infer<typeof deploymentEvidenceRefSchema>;
