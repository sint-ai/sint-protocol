import { z } from "zod";
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/i);
const iso8601Schema = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/);
const uuidV7Schema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
const stateVectorSchema = z.object({
  positions: z.array(z.number().finite()).max(512).optional(),
  velocities: z.array(z.number().finite()).max(512).optional(),
}).strict();

export const vlaActionChunkEnvelopeSchema = z.object({
  chunkId: uuidV7Schema,
  streamId: z.string().min(1).max(128),
  sequence: z.number().int().nonnegative(),
  issuedAt: iso8601Schema,
  executeBy: iso8601Schema,
  horizonMs: z.number().int().positive().max(60_000),
  controlHz: z.number().positive().max(2_000),
  actionCount: z.number().int().positive().max(120_000),
  actionSpaceDigest: digestSchema,
  embodimentId: z.string().min(1).max(128),
  worldSnapshotDigest: digestSchema,
  firstState: stateVectorSchema.optional(),
  lastState: stateVectorSchema.optional(),
  maxVelocityMps: z.number().positive().optional(),
  maxAccelerationMps2: z.number().positive().optional(),
  maxJerkMps3: z.number().positive().optional(),
  safeStopOnFailure: z.literal(true),
}).strict().superRefine((chunk, context) => {
  const expected = chunk.horizonMs * chunk.controlHz / 1000;
  if (Math.abs(chunk.actionCount - expected) > 1) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "actionCount does not match horizonMs and controlHz" });
  }
  if (Date.parse(chunk.executeBy) <= Date.parse(chunk.issuedAt)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "executeBy must be after issuedAt" });
  }
});

export const vlaTaskIntentEnvelopeSchema = z.object({
  intentDigest: digestSchema,
  instructionDigest: digestSchema,
  allowedObjects: z.array(z.string().min(1).max(128)).max(256).optional(),
  allowedZones: z.array(z.string().min(1).max(128)).max(256).optional(),
  allowedOperations: z.array(z.string().min(1).max(128)).max(256).optional(),
  visualSubgoalDigests: z.array(digestSchema).max(128).optional(),
  controlModality: z.string().min(1).max(128).optional(),
  expiresAt: iso8601Schema,
}).strict();

export const vlaMemoryEvidenceRefSchema = z.object({
  evidenceDigest: digestSchema,
  modality: z.enum(["video", "image", "sensor", "text-summary"]),
  sourceId: z.string().min(1).max(256),
  writerId: z.string().min(1).max(256),
  observedFrom: iso8601Schema,
  observedUntil: iso8601Schema,
  worldStateEpoch: z.string().min(1).max(256),
  parentEvidenceDigests: z.array(digestSchema).min(1).max(128).optional(),
  confidence: z.number().min(0).max(1).optional(),
  expiresAt: iso8601Schema,
}).strict().superRefine((memory, context) => {
  if (memory.modality === "text-summary" && !memory.parentEvidenceDigests?.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "text-summary memory requires parent evidence" });
  }
});

export const vlaAdaptationPermitSchema = z.object({
  permitId: uuidV7Schema,
  baseCheckpointDigest: digestSchema,
  trainableComponents: z.array(z.string().min(1).max(128)).min(1).max(32),
  rewardSpecDigest: digestSchema,
  datasetDigest: digestSchema.optional(),
  rollbackCheckpointDigest: digestSchema,
  maxTrials: z.number().int().positive().max(1_000_000),
  maxDurationMs: z.number().int().positive(),
  maxVelocityMps: z.number().positive().optional(),
  maxForceNewtons: z.number().positive().optional(),
  requiresSimulationPass: z.literal(true),
  expiresAt: iso8601Schema,
}).strict();
