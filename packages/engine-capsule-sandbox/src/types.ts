/**
 * SINT Protocol — Capsule Sandbox types.
 *
 * Defines the capsule lifecycle states, instance metadata,
 * error codes, and the restricted API surface exposed to capsules.
 *
 * @module @sint/engine-capsule-sandbox/types
 */

import type {
  SintCapsuleManifest,
  SintSensorReading,
  UUIDv7,
} from "@pshkv/core";

/** Lifecycle state of a capsule instance. */
export type CapsuleState =
  | "registered"
  | "loaded"
  | "running"
  | "stopped"
  | "error";

/** Metadata for a registered or loaded capsule. */
export interface CapsuleInstance {
  readonly manifest: SintCapsuleManifest;
  readonly state: CapsuleState;
  readonly loadedAt?: string;
  readonly lastExecutedAt?: string;
  readonly executionCount: number;
}

/** Structured error returned from capsule operations. */
export interface CapsuleError {
  readonly code:
    | "MANIFEST_INVALID"
    | "HASH_MISMATCH"
    | "MEMORY_EXCEEDED"
    | "CPU_TIMEOUT"
    | "LOAD_FAILED"
    | "EXECUTION_FAILED"
    | "NOT_FOUND"
    | "ALREADY_REGISTERED"
    | "API_DENIED";
  readonly message: string;
  readonly capsuleId?: UUIDv7;
}

/**
 * Restricted API surface exposed to capsules at runtime.
 *
 * Capsules may only read sensors they declared and must route
 * all actions through the Policy Gateway via `requestAction`.
 */
export interface CapsuleApi {
  /** Read a sensor value by ID. Returns null if unavailable. */
  readSensor(sensorId: string): Promise<SintSensorReading | null>;

  /** Request permission to perform an action on a resource. */
  requestAction(
    action: string,
    resource: string,
    params: Record<string, unknown>,
  ): Promise<{ allowed: boolean; reason?: string }>;

  /** Log a message with the capsule's identity prefix. */
  log(level: "info" | "warn" | "error", message: string): void;
}
