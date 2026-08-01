/**
 * SINT Protocol - Zod validation schemas for per-part factory trace bundles.
 */

import { z } from "zod";
import {
  ed25519PublicKeySchema,
  ed25519SignatureSchema,
  iso8601Schema,
  sha256Schema,
  uuidV7Schema,
} from "./capability-token.schema.js";
import { redactionProfileSchema, correctionEventRefSchema, evidenceArtifactRefSchema } from "./trace-bundle.schema.js";

export const partTraceRouteStepSchema = z.object({
  stepId: z.string().min(1).max(128),
  operation: z.string().min(1).max(128),
  machineId: z.string().min(1).max(128).optional(),
  cellId: z.string().min(1).max(128).optional(),
  programDigest: sha256Schema.optional(),
  simulationReceiptRef: z.string().min(1).max(512).optional(),
  inspectionReceiptRef: z.string().min(1).max(512).optional(),
  approvalRef: z.string().min(1).max(512).optional(),
  completedAt: iso8601Schema.optional(),
}).strict();

export const partTraceDispositionSchema = z.enum([
  "release",
  "hold",
  "quarantine",
  "ship",
]);

export const partTraceBundleSchema = z.object({
  bundleId: uuidV7Schema,
  traceKind: z.literal("factory-part"),
  generatedAt: iso8601Schema,
  evidenceArtifacts: z.array(evidenceArtifactRefSchema).max(256),
  redactionProfile: redactionProfileSchema.optional(),
  correctionEvents: z.array(correctionEventRefSchema).max(256).optional(),
  previousBundleHash: sha256Schema.optional(),
  bundleHash: sha256Schema,
  signerPublicKey: ed25519PublicKeySchema,
  signature: ed25519SignatureSchema,
  partNumber: z.string().min(1).max(128),
  revision: z.string().min(1).max(64).optional(),
  materialLotId: z.string().min(1).max(128).optional(),
  routeId: z.string().min(1).max(128).optional(),
  routeSteps: z.array(partTraceRouteStepSchema).max(256),
  authorityTokenRefs: z.array(z.string().min(1).max(512)).max(64),
  inspectionReceiptRefs: z.array(z.string().min(1).max(512)).max(64),
  approvalRefs: z.array(z.string().min(1).max(512)).max(64),
  nonconformanceRefs: z.array(z.string().min(1).max(512)).max(64),
  reworkRefs: z.array(z.string().min(1).max(512)).max(64),
  shipmentDisposition: partTraceDispositionSchema,
  customerSafe: z.boolean().optional(),
}).strict();

export type ValidatedPartTraceRouteStep = z.infer<typeof partTraceRouteStepSchema>;
export type ValidatedPartTraceBundle = z.infer<typeof partTraceBundleSchema>;
