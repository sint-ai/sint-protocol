/**
 * SINT Protocol — Capability Token Validator.
 *
 * Validates capability tokens: signature verification, expiry checks,
 * delegation depth enforcement, and physical constraint checking.
 *
 * CRITICAL INVARIANT: Token validation is a PURE FUNCTION.
 * No side effects, no I/O, deterministic output for same inputs.
 * This ensures the security boundary is testable and auditable.
 *
 * @module @sint/gate-capability-tokens/validator
 */

import {
  type CapabilityTokenError,
  type GeoPolygon,
  MAX_DELEGATION_DEPTH,
  type Result,
  type SintCapabilityToken,
  type SintPhysicalConstraints,
  capabilityTokenSchema,
  err,
  ok,
} from "@sint/core";
import { computeSigningPayload } from "./issuer.js";
import { verify } from "./crypto.js";

/**
 * Physical context of the current action, used for constraint checking.
 */
export interface PhysicalActionContext {
  readonly commandedForceNewtons?: number;
  readonly commandedVelocityMps?: number;
  readonly position?: { readonly x: number; readonly y: number };
  readonly humanPresenceDetected?: boolean;
  readonly repetitionCount?: number;
}

/**
 * Runtime model/attestation context supplied by the caller for token-bound checks.
 */
export interface ModelRuntimeContext {
  readonly modelId?: string;
  readonly modelVersion?: string;
  readonly modelFingerprintHash?: string;
  readonly attestationGrade?: 0 | 1 | 2 | 3;
  readonly teeBackend?: "intel-sgx" | "arm-trustzone" | "amd-sev" | "tpm2" | "none";
  readonly assignedTier?: "T0_observe" | "T1_prepare" | "T2_act" | "T3_commit";
}

/**
 * Validate a capability token's structure and schema.
 * Pure function — no I/O, no side effects.
 *
 * @example
 * ```ts
 * const result = validateTokenSchema(token);
 * if (!result.ok) console.error("Invalid token:", result.error);
 * ```
 */
export function validateTokenSchema(
  token: unknown,
): Result<SintCapabilityToken, CapabilityTokenError> {
  const parsed = capabilityTokenSchema.safeParse(token);
  if (!parsed.success) {
    return err("MALFORMED_TOKEN");
  }
  return ok(parsed.data as SintCapabilityToken);
}

/**
 * Verify the Ed25519 signature on a capability token.
 * Pure function — deterministic.
 *
 * @example
 * ```ts
 * const valid = validateTokenSignature(token);
 * if (!valid.ok) console.error("Signature invalid");
 * ```
 */
export function validateTokenSignature(
  token: SintCapabilityToken,
): Result<true, CapabilityTokenError> {
  const { signature, ...rest } = token;
  const payload = computeSigningPayload(rest);
  const valid = verify(token.issuer, signature, payload);
  if (!valid) {
    return err("INVALID_SIGNATURE");
  }
  return ok(true);
}

/**
 * Check if a token has expired.
 * Pure function — takes current time as parameter for testability.
 *
 * @example
 * ```ts
 * const result = validateTokenExpiry(token, new Date());
 * ```
 */
export function validateTokenExpiry(
  token: SintCapabilityToken,
  now: Date = new Date(),
): Result<true, CapabilityTokenError> {
  const expiresAt = new Date(token.expiresAt);
  // No grace period — expired means expired
  if (now >= expiresAt) {
    return err("TOKEN_EXPIRED");
  }
  return ok(true);
}

/**
 * Check if the delegation chain depth is within limits.
 * Pure function.
 *
 * @example
 * ```ts
 * const result = validateDelegationDepth(token, 3);
 * ```
 */
export function validateDelegationDepth(
  token: SintCapabilityToken,
  maxDepth: number = MAX_DELEGATION_DEPTH,
): Result<true, CapabilityTokenError> {
  if (token.delegationChain.depth > maxDepth) {
    return err("DELEGATION_DEPTH_EXCEEDED");
  }
  return ok(true);
}

/**
 * Check if a point is inside a geofence polygon.
 * Uses ray-casting algorithm. Pure function.
 */
export function isPointInPolygon(
  point: { x: number; y: number },
  polygon: GeoPolygon,
): boolean {
  const coords = polygon.coordinates;
  let inside = false;
  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const xi = coords[i]![0];
    const yi = coords[i]![1];
    const xj = coords[j]![0];
    const yj = coords[j]![1];

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Validate physical constraints against the current action context.
 * Pure function — the core safety check before every physical action.
 *
 * CRITICAL: This function is called before EVERY physical action.
 * If this function is skipped, it is a safety hazard.
 *
 * @example
 * ```ts
 * const result = validatePhysicalConstraints(
 *   token.constraints,
 *   { commandedForceNewtons: 45, commandedVelocityMps: 0.3 }
 * );
 * ```
 */
export function validatePhysicalConstraints(
  constraints: SintPhysicalConstraints,
  context: PhysicalActionContext,
): Result<true, CapabilityTokenError> {
  // Force limit check
  if (
    constraints.maxForceNewtons !== undefined &&
    context.commandedForceNewtons !== undefined &&
    context.commandedForceNewtons > constraints.maxForceNewtons
  ) {
    return err("CONSTRAINT_VIOLATION");
  }

  // Velocity limit check
  if (
    constraints.maxVelocityMps !== undefined &&
    context.commandedVelocityMps !== undefined &&
    context.commandedVelocityMps > constraints.maxVelocityMps
  ) {
    return err("CONSTRAINT_VIOLATION");
  }

  // Geofence check
  if (constraints.geofence && context.position) {
    if (!isPointInPolygon(context.position, constraints.geofence)) {
      return err("CONSTRAINT_VIOLATION");
    }
  }

  // Human presence requirement
  if (
    constraints.requiresHumanPresence === true &&
    context.humanPresenceDetected !== true
  ) {
    return err("CONSTRAINT_VIOLATION");
  }

  // Repetition limit check
  if (
    constraints.maxRepetitions !== undefined &&
    context.repetitionCount !== undefined &&
    context.repetitionCount >= constraints.maxRepetitions
  ) {
    return err("CONSTRAINT_VIOLATION");
  }

  // Time window check
  if (constraints.timeWindow) {
    const now = new Date();
    const start = new Date(constraints.timeWindow.start);
    const end = new Date(constraints.timeWindow.end);
    if (now < start || now > end) {
      return err("CONSTRAINT_VIOLATION");
    }
  }

  return ok(true);
}

/**
 * Check if a token grants sufficient permissions for a requested action.
 * Pure function.
 *
 * @example
 * ```ts
 * const result = validatePermissions(token, "ros2:///cmd_vel", "publish");
 * ```
 */
export function validatePermissions(
  token: SintCapabilityToken,
  resource: string,
  action: string,
): Result<true, CapabilityTokenError> {
  // Exact resource match (glob matching can be added later)
  if (token.resource !== resource && !matchesResourcePattern(token.resource, resource)) {
    return err("INSUFFICIENT_PERMISSIONS");
  }

  if (!token.actions.includes(action)) {
    return err("INSUFFICIENT_PERMISSIONS");
  }

  return ok(true);
}

/**
 * Simple glob-style resource pattern matching.
 * Supports trailing /* for prefix matching.
 */
function matchesResourcePattern(pattern: string, resource: string): boolean {
  if (pattern.endsWith("/*")) {
    const prefix = pattern.slice(0, -1); // Remove the *
    return resource.startsWith(prefix);
  }
  if (pattern.endsWith("*")) {
    const prefix = pattern.slice(0, -1);
    return resource.startsWith(prefix);
  }
  return pattern === resource;
}

function normalizeSemver(input: string): [number, number, number] | null {
  const m = input.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return null;
  return [Number(m[1] ?? "0"), Number(m[2] ?? "0"), Number(m[3] ?? "0")];
}

function semverGt(a: string, b: string): boolean {
  const av = normalizeSemver(a);
  const bv = normalizeSemver(b);
  if (!av || !bv) return false;
  if (av[0] !== bv[0]) return av[0] > bv[0];
  if (av[1] !== bv[1]) return av[1] > bv[1];
  return av[2] > bv[2];
}

/**
 * Validate model identity and attestation requirements when present.
 */
export function validateModelAndAttestation(
  token: SintCapabilityToken,
  runtime?: ModelRuntimeContext,
): Result<true, CapabilityTokenError> {
  const mc = token.modelConstraints;
  const ar = token.attestationRequirements;

  if (mc?.allowedModelIds && mc.allowedModelIds.length > 0) {
    if (!runtime?.modelId || !mc.allowedModelIds.includes(runtime.modelId)) {
      return err("CONSTRAINT_VIOLATION");
    }
  }

  if (mc?.maxModelVersion && runtime?.modelVersion) {
    if (semverGt(runtime.modelVersion, mc.maxModelVersion)) {
      return err("CONSTRAINT_VIOLATION");
    }
  }

  if (mc?.modelFingerprintHash) {
    if (!runtime?.modelFingerprintHash || runtime.modelFingerprintHash !== mc.modelFingerprintHash) {
      return err("CONSTRAINT_VIOLATION");
    }
  }

  if (ar?.minAttestationGrade !== undefined) {
    if (runtime?.attestationGrade === undefined || runtime.attestationGrade < ar.minAttestationGrade) {
      return err("CONSTRAINT_VIOLATION");
    }
  }

  if (ar?.allowedTeeBackends && ar.allowedTeeBackends.length > 0) {
    if (!runtime?.teeBackend || !ar.allowedTeeBackends.includes(runtime.teeBackend)) {
      return err("CONSTRAINT_VIOLATION");
    }
  }

  if (ar?.requireForTiers && ar.requireForTiers.length > 0) {
    const tier = runtime?.assignedTier;
    if (tier && (ar.requireForTiers as string[]).includes(tier as string)) {
      if (runtime.attestationGrade === undefined) {
        return err("CONSTRAINT_VIOLATION");
      }
    }
  }

  return ok(true);
}

/**
 * Full token validation — runs ALL checks in sequence.
 * This is the primary entry point for token validation.
 * Pure function.
 *
 * @example
 * ```ts
 * const result = validateCapabilityToken(token, {
 *   resource: "ros2:///cmd_vel",
 *   action: "publish",
 *   physicalContext: { commandedVelocityMps: 0.3 },
 * });
 * ```
 */
export function validateCapabilityToken(
  token: SintCapabilityToken,
  params: {
    resource: string;
    action: string;
    physicalContext?: PhysicalActionContext;
    modelContext?: ModelRuntimeContext;
    now?: Date;
    maxDelegationDepth?: number;
  },
): Result<true, CapabilityTokenError> {
  // 1. Schema validation
  const schemaResult = validateTokenSchema(token);
  if (!schemaResult.ok) return schemaResult;

  // 2. Signature verification
  const sigResult = validateTokenSignature(token);
  if (!sigResult.ok) return sigResult;

  // 3. Expiry check
  const expiryResult = validateTokenExpiry(token, params.now);
  if (!expiryResult.ok) return expiryResult;

  // 4. Delegation depth check
  const delegationResult = validateDelegationDepth(
    token,
    params.maxDelegationDepth,
  );
  if (!delegationResult.ok) return delegationResult;

  // 5. Permission check
  const permResult = validatePermissions(token, params.resource, params.action);
  if (!permResult.ok) return permResult;

  // 6. Model/attestation bound checks (if token carries those constraints)
  const modelResult = validateModelAndAttestation(token, params.modelContext);
  if (!modelResult.ok) return modelResult;

  // 7. Physical constraint check (if context provided)
  if (params.physicalContext) {
    const constraintResult = validatePhysicalConstraints(
      token.constraints,
      params.physicalContext,
    );
    if (!constraintResult.ok) return constraintResult;
  }

  return ok(true);
}
