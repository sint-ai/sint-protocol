/**
 * SINT Protocol - Zod validation schemas for manufacturing execution envelopes.
 */

import { z } from "zod";
import { inspectionReceiptSchema } from "./inspection.schema.js";

const ISO8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const HEX_REGEX = /^[a-f0-9]+$/i;

const iso8601Schema = z.string().regex(ISO8601_REGEX, "Must be ISO 8601 UTC with microsecond precision");
const sha256Schema = z.string().regex(HEX_REGEX).length(64, "SHA-256 hash must be 64 hex chars");

export const manufacturingExecutionContextSchema = z.object({
  partNumber: z.string().min(1).max(128).optional(),
  revision: z.string().min(1).max(64).optional(),
  drawingDigest: sha256Schema.optional(),
  modelDigest: sha256Schema.optional(),
  camProgramDigest: sha256Schema.optional(),
  machineId: z.string().min(1).max(128).optional(),
  cellId: z.string().min(1).max(128).optional(),
  fixtureSet: z.array(z.string().min(1).max(128)).max(64).optional(),
  toolingSet: z.array(z.string().min(1).max(128)).max(64).optional(),
  materialLotId: z.string().min(1).max(128).optional(),
  materialSubstitution: z.string().min(1).max(128).optional(),
  allowedMaterialSubstitutions: z.array(z.string().min(1).max(128)).max(32).optional(),
  routeId: z.string().min(1).max(128).optional(),
  routeStep: z.number().int().min(0).optional(),
  qualityPlanDigest: sha256Schema.optional(),
  inspectionReceiptRef: z.string().min(1).max(512).optional(),
  inspectionStatus: z.enum(["pass", "conditional", "fail"]).optional(),
  inspectedAt: iso8601Schema.optional(),
  inspectionReceipt: inspectionReceiptSchema.optional(),
  flowdownTags: z.array(z.string().min(1).max(128)).max(64).optional(),
}).strict();

export const manufacturingExecutionEnvelopeSchema = z.object({
  envelopeId: z.string().min(1).max(128).optional(),
  contextualBinding: z.object({
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
  }).strict().optional(),
  proofFreshness: z.object({
    maxProofAgeMs: z.number().int().positive().optional(),
    requireObservedAt: z.boolean().optional(),
  }).strict().optional(),
  requiredEvidenceRefs: z.array(z.object({
    evidenceType: z.string().min(1).max(128),
    evidenceRef: z.string().min(1).max(512),
    proofHash: sha256Schema.optional(),
    verifierRef: z.string().min(1).max(512).optional(),
    observedAt: iso8601Schema.optional(),
    maxAgeMs: z.number().int().positive().optional(),
  }).strict()).max(32).optional(),
  allowedVerifiers: z.array(z.string().min(1).max(512)).min(1).max(32).optional(),
  partNumber: z.string().min(1).max(128).optional(),
  revision: z.string().min(1).max(64).optional(),
  drawingDigest: sha256Schema.optional(),
  modelDigest: sha256Schema.optional(),
  camProgramDigest: sha256Schema.optional(),
  machineId: z.string().min(1).max(128).optional(),
  cellId: z.string().min(1).max(128).optional(),
  fixtureSet: z.array(z.string().min(1).max(128)).max(64).optional(),
  toolingSet: z.array(z.string().min(1).max(128)).max(64).optional(),
  materialLotId: z.string().min(1).max(128).optional(),
  allowedMaterialSubstitutions: z.array(z.string().min(1).max(128)).max(32).optional(),
  routeId: z.string().min(1).max(128).optional(),
  maxRouteStep: z.number().int().min(0).optional(),
  qualityPlanDigest: sha256Schema.optional(),
  inspectionRequired: z.boolean().optional(),
  flowdownTags: z.array(z.string().min(1).max(128)).max(64).optional(),
}).strict();

export type ValidatedManufacturingExecutionContext = z.infer<typeof manufacturingExecutionContextSchema>;
export type ValidatedManufacturingExecutionEnvelope = z.infer<typeof manufacturingExecutionEnvelopeSchema>;
