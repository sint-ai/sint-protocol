/**
 * SINT Protocol — Zod validation schemas for kinetic envelopes.
 *
 * These schemas validate the opt-in physics-aware supervision surface. They do
 * not make any autonomy-demand / environmental-capacity formula normative.
 *
 * @module @sint/core/schemas/kinetic-envelope
 */

import { z } from "zod";
import { ApprovalTier, KINETIC_CAPACITY_EXCEEDED } from "../types/index.js";

export const supervisionLevelSchema = z.enum([
  "stable",
  "metacognitive",
  "assisted",
  "regulated",
  "silent_veto",
]);

export const kineticJointLimitSchema = z.object({
  joint: z.string().min(1).max(128),
  maxPositionRad: z.number().optional(),
  maxVelocityRps: z.number().min(0).optional(),
  maxEffortNm: z.number().min(0).optional(),
}).strict();

export const kineticTightenedConstraintsSchema = z.object({
  maxVelocityMps: z.number().min(0).optional(),
  maxForceNewtons: z.number().min(0).optional(),
  maxTorqueNm: z.number().min(0).optional(),
  maxJerkMps3: z.number().min(0).optional(),
  maxAngularVelocityRps: z.number().min(0).optional(),
  jointLimits: z.array(kineticJointLimitSchema).optional(),
  proximityMinMeters: z.number().min(0).optional(),
}).strict();

export const kineticEnvelopeResultSchema = z.object({
  autonomyDemand: z.number().min(0),
  environmentalCapacity: z.number().min(0),
  margin: z.number(),
  capacityKnown: z.boolean(),
  tightenedConstraints: kineticTightenedConstraintsSchema,
  supervision: supervisionLevelSchema,
  rationale: z.array(z.string().min(1)),
}).strict();

export const kineticReceiptSchema = z.object({
  requestId: z.string().min(1),
  autonomyDemand: z.number().min(0),
  environmentalCapacity: z.number().min(0),
  margin: z.number(),
  capacityKnown: z.boolean(),
  supervision: supervisionLevelSchema,
  finalTier: z.nativeEnum(ApprovalTier),
  deautomated: z.boolean(),
  vetoed: z.boolean(),
  policyCode: z.literal(KINETIC_CAPACITY_EXCEEDED).optional(),
  rationale: z.array(z.string().min(1)),
}).strict().superRefine((receipt, ctx) => {
  if (receipt.vetoed && receipt.policyCode !== KINETIC_CAPACITY_EXCEEDED) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "vetoed kinetic receipts must carry KINETIC_CAPACITY_EXCEEDED",
      path: ["policyCode"],
    });
  }

  if (!receipt.vetoed && receipt.policyCode !== undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "policyCode is only valid on vetoed kinetic receipts",
      path: ["policyCode"],
    });
  }

  if (receipt.vetoed && receipt.deautomated) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "vetoed kinetic receipts are not deautomated escalations",
      path: ["deautomated"],
    });
  }
});

export type ValidatedKineticEnvelopeResult = z.infer<typeof kineticEnvelopeResultSchema>;
export type ValidatedKineticReceipt = z.infer<typeof kineticReceiptSchema>;
