/**
 * SINT Protocol — Zod validation schemas for shared trace bundles.
 */

import { z } from "zod";
import {
  ed25519PublicKeySchema,
  ed25519SignatureSchema,
  iso8601Schema,
  sha256Schema,
  uuidV7Schema,
} from "./capability-token.schema.js";

export const evidenceArtifactRefSchema = z.object({
  evidenceType: z.string().min(1).max(128),
  evidenceRef: z.string().min(1).max(512),
  proofHash: sha256Schema,
  verifierRef: z.string().min(1).max(512).optional(),
  observedAt: iso8601Schema.optional(),
  maxAgeMs: z.number().int().positive().optional(),
}).strict();

export const redactionModeSchema = z.enum(["unredacted", "partial", "redacted"]);

export const redactionProfileSchema = z.object({
  mode: redactionModeSchema,
  policyRef: z.string().min(1).max(512).optional(),
  redactedFields: z.array(z.string().min(1).max(128)).min(1).max(128).optional(),
  justification: z.string().min(1).max(1024).optional(),
}).strict();

export const correctionEventRefSchema = z.object({
  eventId: uuidV7Schema,
  correctionType: z.enum([
    "amendment",
    "retraction",
    "replacement",
    "redaction",
    "supplement",
  ]),
  correctedAt: iso8601Schema,
  correctedBy: z.string().min(1).max(256).optional(),
  reason: z.string().min(1).max(1024).optional(),
  previousBundleHash: sha256Schema.optional(),
}).strict();

export const traceBundleBaseSchema = z.object({
  bundleId: uuidV7Schema,
  traceKind: z.string().min(1).max(64),
  generatedAt: iso8601Schema,
  evidenceArtifacts: z.array(evidenceArtifactRefSchema).max(256),
  redactionProfile: redactionProfileSchema.optional(),
  correctionEvents: z.array(correctionEventRefSchema).max(256).optional(),
  previousBundleHash: sha256Schema.optional(),
  bundleHash: sha256Schema,
  signerPublicKey: ed25519PublicKeySchema,
  signature: ed25519SignatureSchema,
}).strict();

export type ValidatedEvidenceArtifactRef = z.infer<typeof evidenceArtifactRefSchema>;
export type ValidatedRedactionProfile = z.infer<typeof redactionProfileSchema>;
export type ValidatedCorrectionEventRef = z.infer<typeof correctionEventRefSchema>;
export type ValidatedTraceBundleBase = z.infer<typeof traceBundleBaseSchema>;

