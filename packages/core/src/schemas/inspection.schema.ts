/**
 * SINT Protocol - Zod validation schemas for inspection receipts.
 */

import { z } from "zod";

const ISO8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const HEX_REGEX = /^[a-f0-9]+$/i;
const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const iso8601Schema = z.string().regex(ISO8601_REGEX, "Must be ISO 8601 UTC with microsecond precision");
const sha256Schema = z.string().regex(HEX_REGEX).length(64, "SHA-256 hash must be 64 hex chars");
const uuidV7Schema = z.string().regex(UUID_V7_REGEX, "Must be a valid UUID v7");

export const inspectionCalibrationStateSchema = z.enum([
  "fresh",
  "stale",
  "expired",
  "unknown",
]);

export const inspectionDispositionSchema = z.enum([
  "pass",
  "conditional",
  "fail",
]);

export const inspectionFeatureResultSchema = z.object({
  featureName: z.string().min(1).max(128),
  measuredValue: z.number(),
  nominalValue: z.number().optional(),
  lowerTolerance: z.number().optional(),
  upperTolerance: z.number().optional(),
  unit: z.string().min(1).max(64).optional(),
  withinTolerance: z.boolean(),
}).strict();

export const inspectionReceiptSchema = z.object({
  receiptId: uuidV7Schema,
  receiptRef: z.string().min(1).max(512).optional(),
  partNumber: z.string().min(1).max(128).optional(),
  revision: z.string().min(1).max(64).optional(),
  inspectionPlanDigest: sha256Schema.optional(),
  machineId: z.string().min(1).max(128).optional(),
  cellId: z.string().min(1).max(128).optional(),
  instrumentId: z.string().min(1).max(128).optional(),
  calibrationState: inspectionCalibrationStateSchema,
  calibrationValidUntil: iso8601Schema.optional(),
  measuredFeatureResults: z.array(inspectionFeatureResultSchema).max(256),
  disposition: inspectionDispositionSchema,
  approverRef: z.string().min(1).max(256).optional(),
  nonconformanceRef: z.string().min(1).max(512).optional(),
  reworkRef: z.string().min(1).max(512).optional(),
  inspectedAt: iso8601Schema,
  evidenceRef: z.string().min(1).max(512).optional(),
}).strict();

export type ValidatedInspectionFeatureResult = z.infer<
  typeof inspectionFeatureResultSchema
>;
export type ValidatedInspectionReceipt = z.infer<typeof inspectionReceiptSchema>;
