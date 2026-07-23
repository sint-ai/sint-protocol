import { z } from "zod";
import { ApprovalTier } from "@pshkv/core";

const approvalTiers = [
  ApprovalTier.T0_OBSERVE,
  ApprovalTier.T1_PREPARE,
  ApprovalTier.T2_ACT,
  ApprovalTier.T3_COMMIT,
] as const;

const parameterContractSchema = z.object({
  type: z.enum(["string", "number", "integer", "boolean"]),
  required: z.boolean().optional(),
  min: z.number().finite().optional(),
  max: z.number().finite().optional(),
  minLength: z.number().int().nonnegative().optional(),
  maxLength: z.number().int().nonnegative().optional(),
  pattern: z.string().max(512).optional(),
  enum: z.array(z.union([z.string(), z.number().finite(), z.boolean()])).optional(),
}).strict().superRefine((contract, ctx) => {
  if (contract.min !== undefined && contract.max !== undefined && contract.min > contract.max) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "min cannot exceed max" });
  }
  if (
    contract.minLength !== undefined
    && contract.maxLength !== undefined
    && contract.minLength > contract.maxLength
  ) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "minLength cannot exceed maxLength" });
  }
  if (contract.pattern !== undefined) {
    const valid = RegExpResult(contract.pattern);
    if (!valid) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "pattern must be a valid regular expression" });
    }
  }
});

function RegExpResult(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

export const effectContractSchema = z.object({
  effectId: z.string().min(1).max(160).regex(/^[a-z0-9][a-z0-9._/-]*$/),
  resource: z.string().min(1).max(1024),
  action: z.string().min(1).max(128),
  minimumTier: z.enum(approvalTiers),
  parameters: z.record(z.string().min(1).max(128), parameterContractSchema),
  allowAdditionalParameters: z.boolean().optional(),
  maxDurationMs: z.number().int().positive().max(86_400_000),
  maxOutputBytes: z.number().int().nonnegative().max(16_777_216),
  secretPatterns: z.array(z.string().min(1).max(512)).max(64).optional(),
  physicalBindings: z.object({
    velocityParameter: z.string().min(1).max(128).optional(),
    forceParameter: z.string().min(1).max(128).optional(),
    positionXParameter: z.string().min(1).max(128).optional(),
    positionYParameter: z.string().min(1).max(128).optional(),
    humanPresenceParameter: z.string().min(1).max(128).optional(),
  }).strict().optional(),
  effectClass: z.enum([
    "observe",
    "compute",
    "physical-motion",
    "physical-contact",
    "configuration",
    "economic-commit",
  ]),
}).strict().superRefine((effect, ctx) => {
  for (const parameterName of Object.values(effect.physicalBindings ?? {})) {
    if (parameterName !== undefined && effect.parameters[parameterName] === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `physical binding references undeclared parameter: ${parameterName}`,
      });
    }
  }
});

const effectPackPayloadBaseSchema = z.object({
  schemaVersion: z.literal("sint-effect-pack/1"),
  packId: z.string().min(1).max(160).regex(/^[a-z0-9][a-z0-9._/-]*$/),
  version: z.string().min(1).max(64),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  issuer: z.string().regex(/^[0-9a-f]{64}$/),
  effects: z.array(effectContractSchema).min(1).max(512),
}).strict();

function validateEffectPack(
  pack: z.infer<typeof effectPackPayloadBaseSchema>,
  ctx: z.RefinementCtx,
): void {
  const ids = new Set<string>();
  for (const effect of pack.effects) {
    if (ids.has(effect.effectId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate effectId: ${effect.effectId}`,
      });
    }
    ids.add(effect.effectId);
  }
  if (pack.expiresAt !== undefined && Date.parse(pack.expiresAt) <= Date.parse(pack.issuedAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "pack expiry must follow issuance" });
  }
}

export const effectPackPayloadSchema = effectPackPayloadBaseSchema.superRefine(validateEffectPack);

export const signedEffectPackSchema = effectPackPayloadBaseSchema.extend({
  digest: z.string().regex(/^[0-9a-f]{64}$/),
  signature: z.string().regex(/^[0-9a-f]{128}$/),
}).strict().superRefine(validateEffectPack);

export const dispatchEnvelopePayloadSchema = z.object({
  schemaVersion: z.literal("sint-dispatch/1"),
  dispatchId: z.string().uuid(),
  requestId: z.string().uuid(),
  actionRef: z.string().min(1).max(256),
  runnerId: z.string().min(1).max(256),
  packId: z.string().min(1).max(160),
  packDigest: z.string().regex(/^[0-9a-f]{64}$/),
  effectId: z.string().min(1).max(160),
  params: z.record(z.unknown()),
  capabilityToken: z.record(z.unknown()),
  authorization: z.object({
    decision: z.enum(["allow", "transform"]),
    assignedTier: z.enum(approvalTiers),
    policyEventHash: z.string().regex(/^[0-9a-f]{64}$/),
    approvalEventHash: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  }).strict(),
  physicalContext: z.object({
    commandedForceNewtons: z.number().finite().optional(),
    commandedVelocityMps: z.number().finite().optional(),
    position: z.object({ x: z.number().finite(), y: z.number().finite() }).strict().optional(),
    humanPresenceDetected: z.boolean().optional(),
    repetitionCount: z.number().int().nonnegative().optional(),
  }).strict().optional(),
  issuedAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  nonce: z.string().min(16).max(256),
  signer: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

export const signedDispatchEnvelopeSchema = dispatchEnvelopePayloadSchema.extend({
  signature: z.string().regex(/^[0-9a-f]{128}$/),
}).strict();
