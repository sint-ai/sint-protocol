import { z } from "zod";

const ISO8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const HEX_REGEX = /^[a-f0-9]+$/i;

export const humanAssuranceLevelSchema = z.enum([
  "humanhood",
  "uniqueness",
  "delegation",
  "contextual_binding",
]);

export const humanAuthorityBindingSchema = z.object({
  applicationId: z.string().min(1).max(256).optional(),
  siteId: z.string().min(1).max(256).optional(),
  robotId: z.string().min(1).max(256).optional(),
  resource: z.string().min(1).max(512).optional(),
  action: z.string().min(1).max(64).optional(),
  valueCurrency: z.string().min(1).max(16).optional(),
  minValue: z.number().finite().optional(),
  maxValue: z.number().finite().optional(),
  validFrom: z.string().regex(ISO8601_REGEX).optional(),
  validUntil: z.string().regex(ISO8601_REGEX).optional(),
}).strict();

export const humanDelegationChainSchema = z.object({
  depth: z.number().int().min(0).max(32),
  rootPrincipalRef: z.string().min(1).max(256).optional(),
  parentProofRef: z.string().min(1).max(512).optional(),
  hopProofRefs: z.array(z.string().min(1).max(512)).min(1).max(16).optional(),
}).strict();

export const humanAuthorityProofSchema = z.object({
  principalRef: z.string().min(1).max(256),
  assuranceLevel: humanAssuranceLevelSchema,
  proofRef: z.string().min(1).max(512).optional(),
  proofHash: z.string().regex(HEX_REGEX).length(64).optional(),
  verifierRef: z.string().min(1).max(512).optional(),
  observedAt: z.string().regex(ISO8601_REGEX).optional(),
  revokedAt: z.string().regex(ISO8601_REGEX).optional(),
  binding: humanAuthorityBindingSchema.optional(),
  delegationChain: humanDelegationChainSchema.optional(),
}).strict();

export const humanAuthorityRequirementsSchema = z.object({
  requiredAssuranceLevel: humanAssuranceLevelSchema,
  allowedProofProviders: z.array(z.string().min(1).max(512)).min(1).max(32).optional(),
  maxProofAgeMs: z.number().int().positive().optional(),
  requiredBinding: humanAuthorityBindingSchema.optional(),
  allowedDelegationDepth: z.number().int().min(0).max(32).optional(),
  requireUniquePrincipal: z.boolean().optional(),
}).strict();

export type ValidatedHumanAuthorityProof = z.infer<typeof humanAuthorityProofSchema>;
export type ValidatedHumanAuthorityRequirements = z.infer<typeof humanAuthorityRequirementsSchema>;
