/**
 * SINT Protocol — Physical Constraint Checker.
 *
 * Validates that a request's parameters don't violate the
 * physical constraints in the agent's capability token.
 *
 * This is called BEFORE every physical action. Skipping
 * this check is a safety hazard.
 *
 * @module @pshkv/gate-policy-gateway/constraint-checker
 */

import type {
  Result,
  SintCapabilityToken,
  SintRequest,
} from "@pshkv/core";
import { ok, err } from "@pshkv/core";
import {
  validatePhysicalConstraints,
  type PhysicalActionContext,
} from "@pshkv/gate-capability-tokens";

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
 *
 * Velocity extraction fallbacks:
 * - params.velocity (scalar)
 * - params.linear_velocity (scalar)
 * - params.linear.{x,y,z} (Twist shape — uses magnitude)
 * - physicalContext.currentVelocityMps (scalar)
 */
export function extractPhysicalContext(
  request: SintRequest,
): PhysicalActionContext {
  // Extract velocity from params, with fallback to physicalContext
  let commandedVelocityMps =
    (request.params["velocity"] as number | undefined) ??
    (request.params["linear_velocity"] as number | undefined) ??
    request.physicalContext?.currentVelocityMps;

  // If no velocity found, try Twist shape (geometry_msgs/Twist: linear.x/y/z, angular.x/y/z)
  if (commandedVelocityMps === undefined) {
    const linear = request.params["linear"] as
      | { x?: number; y?: number; z?: number }
      | undefined;
    if (linear && (linear.x !== undefined || linear.y !== undefined || linear.z !== undefined)) {
      const x = linear.x ?? 0;
      const y = linear.y ?? 0;
      const z = linear.z ?? 0;
      commandedVelocityMps = Math.sqrt(x * x + y * y + z * z);
    }
  }

  // Angular velocity extraction (rad/s)
  let commandedAngularVelocityRps =
    (request.params["angular_velocity"] as number | undefined) ??
    request.physicalContext?.currentAngularVelocityRps;

  // If no scalar angular velocity, try from Twist angular.z
  if (commandedAngularVelocityRps === undefined) {
    const angular = request.params["angular"] as
      | { x?: number; y?: number; z?: number }
      | undefined;
    if (angular?.z !== undefined) {
      commandedAngularVelocityRps = Math.abs(angular.z);
    }
  }

  return {
    commandedForceNewtons:
      (request.params["force"] as number | undefined) ??
      request.physicalContext?.currentForceNewtons,
    commandedVelocityMps,
    commandedTorqueNm: (request.params["torque"] as number | undefined) ??
      request.physicalContext?.currentTorqueNm,
    commandedJerkMps3: (request.params["jerk"] as number | undefined) ??
      request.physicalContext?.currentJerkMps3,
    commandedAngularVelocityRps,
    currentContactForceNewtons: request.physicalContext?.currentContactForceNewtons,
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

  // Torque check
  if (
    token.constraints.maxTorqueNm !== undefined &&
    context.commandedTorqueNm !== undefined &&
    context.commandedTorqueNm > token.constraints.maxTorqueNm
  ) {
    violations.push({
      constraint: "maxTorqueNm",
      limit: token.constraints.maxTorqueNm,
      actual: context.commandedTorqueNm,
      message: `Torque ${context.commandedTorqueNm}Nm exceeds limit ${token.constraints.maxTorqueNm}Nm`,
    });
  }

  // Jerk check
  if (
    token.constraints.maxJerkMps3 !== undefined &&
    context.commandedJerkMps3 !== undefined &&
    context.commandedJerkMps3 > token.constraints.maxJerkMps3
  ) {
    violations.push({
      constraint: "maxJerkMps3",
      limit: token.constraints.maxJerkMps3,
      actual: context.commandedJerkMps3,
      message: `Jerk ${context.commandedJerkMps3}m/s³ exceeds limit ${token.constraints.maxJerkMps3}m/s³`,
    });
  }

  // Angular velocity check
  if (
    token.constraints.maxAngularVelocityRps !== undefined &&
    context.commandedAngularVelocityRps !== undefined &&
    context.commandedAngularVelocityRps > token.constraints.maxAngularVelocityRps
  ) {
    violations.push({
      constraint: "maxAngularVelocityRps",
      limit: token.constraints.maxAngularVelocityRps,
      actual: context.commandedAngularVelocityRps,
      message: `Angular velocity ${context.commandedAngularVelocityRps}rad/s exceeds limit ${token.constraints.maxAngularVelocityRps}rad/s`,
    });
  }

  // Contact force threshold check
  if (
    token.constraints.contactForceThresholdN !== undefined &&
    context.currentContactForceNewtons !== undefined &&
    context.currentContactForceNewtons > token.constraints.contactForceThresholdN
  ) {
    violations.push({
      constraint: "contactForceThresholdN",
      limit: token.constraints.contactForceThresholdN,
      actual: context.currentContactForceNewtons,
      message: `Contact force ${context.currentContactForceNewtons}N exceeds threshold ${token.constraints.contactForceThresholdN}N`,
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
