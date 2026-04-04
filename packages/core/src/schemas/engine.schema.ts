/**
 * SINT Protocol — Zod validation schemas for Engine Layer types.
 *
 * These schemas validate capsule manifests, hardware profiles,
 * world state, and plans before processing.
 *
 * @module @sint/core/schemas/engine
 */

import { z } from "zod";
import {
  iso8601Schema,
  sha256Schema,
  uuidV7Schema,
} from "./capability-token.schema.js";

// ---------------------------------------------------------------------------
// Sensor Modalities
// ---------------------------------------------------------------------------

export const sensorModalitySchema = z.enum([
  "camera_rgb",
  "camera_depth",
  "lidar",
  "imu",
  "force_torque",
  "joint_state",
  "gps",
  "ultrasonic",
  "infrared",
  "microphone",
  "tactile",
]);

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export const point3DSchema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const poseSchema = z.object({
  position: point3DSchema,
  orientation: z.object({
    roll: z.number(),
    pitch: z.number(),
    yaw: z.number(),
  }),
});

// ---------------------------------------------------------------------------
// Capsule Manifest (SCS-1)
// ---------------------------------------------------------------------------

export const capsuleResourceLimitsSchema = z.object({
  maxMemoryMB: z.number().int().positive().max(8192),
  maxCpuTimeMs: z.number().int().positive().max(300_000),
  maxStorageMB: z.number().int().nonnegative().max(10_240),
}).strict();

export const capsuleSafetyDeclarationsSchema = z.object({
  maxForceNewtons: z.number().positive().optional(),
  maxVelocityMps: z.number().positive().optional(),
  requiresHumanPresence: z.boolean().optional(),
  canTriggerEstop: z.boolean().optional(),
}).strict();

export const capsuleManifestSchema = z.object({
  capsuleId: uuidV7Schema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Must be semantic version (x.y.z)"),
  name: z.string().min(1).max(128),
  author: z.string().min(1).max(128),
  description: z.string().max(1024).optional(),
  sensors: z.array(sensorModalitySchema).max(16),
  actuators: z.array(z.string().min(1).max(256)).max(16),
  safetyDeclarations: capsuleSafetyDeclarationsSchema,
  resourceLimits: capsuleResourceLimitsSchema,
  runtime: z.enum(["wasm", "typescript"]),
  entryPoint: z.string().min(1).max(256),
  contentHash: sha256Schema,
}).strict();

// ---------------------------------------------------------------------------
// Hardware Profile
// ---------------------------------------------------------------------------

export const hardwareProfileSchema = z.object({
  arch: z.string().min(1).max(32),
  platform: z.string().min(1).max(32),
  cpuCores: z.number().int().positive(),
  totalMemoryMB: z.number().int().positive(),
  gpuInfo: z.object({
    name: z.string().min(1).max(128),
    computeCapability: z.string().optional(),
    memoryMB: z.number().int().positive().optional(),
  }).nullable(),
  deploymentProfile: z.enum(["full", "edge", "split", "lite"]),
}).strict();

// ---------------------------------------------------------------------------
// World State
// ---------------------------------------------------------------------------

export const perceivedObjectSchema = z.object({
  classLabel: z.string().min(1).max(128),
  confidence: z.number().min(0).max(1),
  boundingBox3D: z.object({
    min: point3DSchema,
    max: point3DSchema,
  }),
  isHuman: z.boolean(),
  estimatedVelocity: z.number().nonnegative().optional(),
});

export const anomalyFlagSchema = z.object({
  type: z.enum(["distribution_shift", "low_confidence", "novelty", "sensor_fault", "collision_risk"]),
  severity: z.number().min(0).max(1),
  source: z.string().min(1).max(128),
  message: z.string().min(1).max(512),
});

export const worldStateSchema = z.object({
  timestamp: iso8601Schema,
  objects: z.array(perceivedObjectSchema).max(256),
  robotPose: poseSchema,
  occupancyGrid: z.array(z.array(z.boolean())).optional(),
  anomalyFlags: z.array(anomalyFlagSchema).max(64),
  humanPresent: z.boolean(),
});

// ---------------------------------------------------------------------------
// Plan
// ---------------------------------------------------------------------------

export const planStepSchema = z.object({
  action: z.string().min(1).max(128),
  resource: z.string().min(1).max(512),
  params: z.record(z.unknown()),
  requiredTier: z.enum(["T0_observe", "T1_prepare", "T2_act", "T3_commit"]),
  preconditions: z.array(z.string().min(1).max(256)),
  postconditions: z.array(z.string().min(1).max(256)).optional(),
});

export const planSchema = z.object({
  planId: uuidV7Schema,
  goalId: uuidV7Schema,
  steps: z.array(planStepSchema).min(1).max(256),
  estimatedDurationMs: z.number().int().nonnegative(),
  status: z.enum(["pending", "validating", "approved", "executing", "completed", "failed", "aborted"]),
  createdAt: iso8601Schema,
}).strict();

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type ValidatedCapsuleManifest = z.infer<typeof capsuleManifestSchema>;
export type ValidatedHardwareProfile = z.infer<typeof hardwareProfileSchema>;
export type ValidatedWorldState = z.infer<typeof worldStateSchema>;
export type ValidatedPlan = z.infer<typeof planSchema>;
