/**
 * SINT Protocol — Physical Constraint Checker.
 *
 * Validates that a request's parameters don't violate the
 * physical constraints in the agent's capability token.
 *
 * This is called BEFORE every physical action. Skipping
 * this check is a safety hazard.
 *
 * @module @sint/gate-policy-gateway/constraint-checker
 */

import type {
  Result,
  SintCapabilityToken,
  SintRequest,
} from "@sint/core";
import { ok, err } from "@sint/core";
import {
  validatePhysicalConstraints,
  type PhysicalActionContext,
} from "@sint/gate-capability-tokens";

/** Constraint check failure details. */
export interface ConstraintViolation {
  readonly constraint: string;
  readonly limit: number | string;
  readonly actual: number | string;
  readonly message: string;
}

/**
 * Extract physical action context from a SINT request.
 * Maps request params and physical context to the format
 * expected by the constraint validator.
 */
export function extractPhysicalContext(
  request: SintRequest,
): PhysicalActionContext {
  return {
    commandedForceNewtons:
      (request.params["force"] as number | undefined) ??
      request.physicalContext?.currentForceNewtons,
    commandedVelocityMps:
      (request.params["velocity"] as number | undefined) ??
      (request.params["linear_velocity"] as number | undefined) ??
      request.physicalContext?.currentVelocityMps,
    position: request.physicalContext?.currentPosition
      ? {
          x: request.physicalContext.currentPosition.x,
          y: request.physicalContext.currentPosition.y,
        }
      : undefined,
    humanPresenceDetected: request.physicalContext?.humanDetected,
  };
}

/**
 * Dynamic envelope overrides from environment-aware sensors.
 * These tighten (never loosen) the effective constraint limits from the token.
 * Used by the DynamicEnvelopePlugin to enforce distance-adaptive velocity caps.
 */
export interface EnvelopeOverrides {
  /** Tighter velocity limit (m/s) derived from obstacle proximity or safety zone. */
  readonly maxVelocityMps?: number;
  /** Tighter force limit (N) derived from proximity to fragile objects or humans. */
  readonly maxForceNewtons?: number;
}

/**
 * Check all physical constraints for a request against a token.
 *
 * @param overrides - Optional dynamic envelope overrides that further tighten
 *   the effective constraint limits. The effective limit is min(token, override).
 *
 * @example
 * ```ts
 * const result = checkConstraints(token, request);
 * if (!result.ok) {
 *   console.error("Constraint violated:", result.error);
 * }
 * ```
 */
export function checkConstraints(
  token: SintCapabilityToken,
  request: SintRequest,
  overrides?: EnvelopeOverrides,
): Result<true, ConstraintViolation[]> {
  const context = extractPhysicalContext(request);
  const violations: ConstraintViolation[] = [];

  // Effective limits: envelope overrides can only tighten token limits
  const effectiveMaxForce =
    token.constraints.maxForceNewtons !== undefined && overrides?.maxForceNewtons !== undefined
      ? Math.min(token.constraints.maxForceNewtons, overrides.maxForceNewtons)
      : (overrides?.maxForceNewtons ?? token.constraints.maxForceNewtons);
  const effectiveMaxVelocity =
    token.constraints.maxVelocityMps !== undefined && overrides?.maxVelocityMps !== undefined
      ? Math.min(token.constraints.maxVelocityMps, overrides.maxVelocityMps)
      : (overrides?.maxVelocityMps ?? token.constraints.maxVelocityMps);

  // Force check
  if (
    effectiveMaxForce !== undefined &&
    context.commandedForceNewtons !== undefined &&
    context.commandedForceNewtons > effectiveMaxForce
  ) {
    violations.push({
      constraint: "maxForceNewtons",
      limit: effectiveMaxForce,
      actual: context.commandedForceNewtons,
      message: `Force ${context.commandedForceNewtons}N exceeds limit ${effectiveMaxForce}N${overrides?.maxForceNewtons !== undefined ? " (dynamic envelope)" : ""}`,
    });
  }

  // Velocity check
  if (
    effectiveMaxVelocity !== undefined &&
    context.commandedVelocityMps !== undefined &&
    context.commandedVelocityMps > effectiveMaxVelocity
  ) {
    violations.push({
      constraint: "maxVelocityMps",
      limit: effectiveMaxVelocity,
      actual: context.commandedVelocityMps,
      message: `Velocity ${context.commandedVelocityMps}m/s exceeds limit ${effectiveMaxVelocity}m/s${overrides?.maxVelocityMps !== undefined ? " (dynamic envelope)" : ""}`,
    });
  }

  // Geofence check
  if (token.constraints.geofence && context.position) {
    const result = validatePhysicalConstraints(
      { geofence: token.constraints.geofence },
      { position: context.position },
    );
    if (!result.ok) {
      violations.push({
        constraint: "geofence",
        limit: "within polygon",
        actual: `(${context.position.x}, ${context.position.y})`,
        message: `Position outside geofence boundary`,
      });
    }
  }

  // Human presence check
  if (
    token.constraints.requiresHumanPresence === true &&
    context.humanPresenceDetected !== true
  ) {
    violations.push({
      constraint: "requiresHumanPresence",
      limit: "true",
      actual: String(context.humanPresenceDetected ?? false),
      message: "Human presence required but not detected",
    });
  }

  if (violations.length > 0) {
    return err(violations);
  }

  return ok(true);
}
