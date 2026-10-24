import { z } from "zod";

const ISO8601_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;
const HEX_REGEX = /^[a-f0-9]+$/i;
const UUID_V7_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const iso8601Schema = z.string().regex(ISO8601_REGEX);
const sha256Schema = z.string().regex(HEX_REGEX).length(64);
const ed25519PublicKeySchema = z.string().regex(HEX_REGEX).length(64);
const ed25519SignatureSchema = z.string().regex(HEX_REGEX).length(128);
const uuidV7Schema = z.string().regex(UUID_V7_REGEX);

const boundedLabel = z.string().min(1).max(128);

export const hazardousEnergyEnvelopeSchema = z.object({
  domain: z.enum(["laser", "welding", "thermal", "radiation"]),
  actuatorIds: z.array(boundedLabel).min(1).max(128),
  maxPowerWatts: z.number().positive().optional(),
  maxPulseEnergyJoules: z.number().positive().optional(),
  maxDwellMs: z.number().positive().optional(),
  maxDutyCyclePercent: z.number().positive().max(100).optional(),
  maxFiringsPerMinute: z.number().int().positive().optional(),
  allowedTargetClasses: z.array(boundedLabel).min(1).max(128),
  protectedTargetClasses: z.array(boundedLabel).min(1).max(128),
  minTargetConfidence: z.number().min(0).max(1),
  maxObservationAgeMs: z.number().int().positive(),
  maxSpatialUncertaintyMm: z.number().nonnegative(),
  minProtectedObjectClearanceMm: z.number().nonnegative(),
  requiredInterlocks: z.array(boundedLabel).min(1).max(64).optional(),
  requireHealthyCooling: z.boolean().optional(),
  requireHardwarePermit: z.literal(true),
}).strict().superRefine((value, context) => {
  const overlap = value.allowedTargetClasses.find((item) => value.protectedTargetClasses.includes(item));
  if (overlap !== undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["protectedTargetClasses"],
      message: `Target class ${overlap} cannot be both allowed and protected`,
    });
  }
});

export const perceptionEvidenceSchema = z.object({
  evidenceId: uuidV7Schema,
  observedAt: iso8601Schema,
  validUntil: iso8601Schema,
  sensorId: boundedLabel,
  frameDigest: sha256Schema,
  modelId: boundedLabel,
  checkpointDigest: sha256Schema,
  calibrationDigest: sha256Schema,
  target: z.object({
    classId: boundedLabel,
    confidence: z.number().min(0).max(1),
    centroid: z.object({
      x: z.number().finite(),
      y: z.number().finite(),
    }).strict(),
    spatialUncertaintyMm: z.number().nonnegative(),
  }).strict(),
  nearbyProtectedObjects: z.array(z.object({
    classId: boundedLabel,
    confidence: z.number().min(0).max(1),
    distanceMm: z.number().nonnegative(),
  }).strict()).max(256),
  verifierRef: z.string().min(1).max(512),
  signerPublicKey: ed25519PublicKeySchema,
  signature: ed25519SignatureSchema,
}).strict().superRefine((value, context) => {
  if (Date.parse(value.validUntil) <= Date.parse(value.observedAt)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["validUntil"],
      message: "Perception evidence must expire after it was observed",
    });
  }
});

export type ValidatedHazardousEnergyEnvelope = z.infer<typeof hazardousEnergyEnvelopeSchema>;
export type ValidatedPerceptionEvidence = z.infer<typeof perceptionEvidenceSchema>;
