/**
 * CL-1.0 Constraint Language parser, validator, and merge utilities.
 *
 * Provides validation, effective-constraint resolution, tighten-only merge,
 * and widening-violation detection for {@link ConstraintEnvelope}.
 *
 * @module @sint/core/constraint-language
 */

import type { ConstraintEnvelope, ConstraintEnvelopeMode } from "./types/protocol.js";

/** Result of validating a {@link ConstraintEnvelope} against CL-1.0 rules. */
export interface ConstraintValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly mode: ConstraintEnvelopeMode | "legacy";
}

const VALID_MODES: readonly string[] = ["static-token", "dynamic-runtime", "corridor-preapproved"];

/**
 * Validate a ConstraintEnvelope against CL-1.0 rules.
 *
 * Legacy envelopes (no `version` field) are always considered valid.
 * CL-1.0 envelopes are checked for mode validity, required fields per mode,
 * and numeric range constraints.
 */
export function validateConstraintEnvelope(envelope: ConstraintEnvelope): ConstraintValidationResult {
  const errors: string[] = [];

  // Determine mode
  const mode: ConstraintEnvelopeMode | "legacy" = envelope.version === "cl-1.0"
    ? (envelope.mode ?? "static-token")
    : "legacy";

  // CL-1.0 validation
  if (envelope.version === "cl-1.0") {
    if (envelope.mode !== undefined && !VALID_MODES.includes(envelope.mode)) {
      errors.push(`Invalid mode: ${envelope.mode}`);
    }

    if (envelope.dynamic?.tightenOnly === undefined && envelope.mode === "dynamic-runtime") {
      errors.push("dynamic.tightenOnly is required when mode is dynamic-runtime");
    }

    if (envelope.physical?.rateLimit) {
      if (envelope.physical.rateLimit.maxCalls <= 0) {
        errors.push("physical.rateLimit.maxCalls must be > 0");
      }
      if (envelope.physical.rateLimit.windowMs <= 0) {
        errors.push("physical.rateLimit.windowMs must be > 0");
      }
    }

    if (envelope.physical?.maxVelocityMps !== undefined && envelope.physical.maxVelocityMps < 0) {
      errors.push("physical.maxVelocityMps must be >= 0");
    }

    if (envelope.physical?.maxForceNewtons !== undefined && envelope.physical.maxForceNewtons < 0) {
      errors.push("physical.maxForceNewtons must be >= 0");
    }
  }

  return { valid: errors.length === 0, errors, mode };
}

/**
 * Resolve effective physical constraints from a CL-1.0 envelope.
 *
 * CL-1.0 structured fields (`physical.*`) take priority over legacy top-level fields.
 * `execution.*` takes priority over legacy corridor fields.
 */
export function resolveEffectiveConstraints(envelope: ConstraintEnvelope): {
  readonly maxVelocityMps?: number;
  readonly maxForceNewtons?: number;
  readonly maxDeviationMeters?: number;
  readonly corridorId?: string;
  readonly requiresHumanPresence?: boolean;
} {
  return {
    maxVelocityMps: envelope.physical?.maxVelocityMps ?? envelope.maxVelocityMps,
    maxForceNewtons: envelope.physical?.maxForceNewtons ?? envelope.maxForceNewtons,
    maxDeviationMeters: envelope.execution?.maxDeviationMeters ?? envelope.maxDeviationMeters,
    corridorId: envelope.execution?.corridorId ?? envelope.corridorId,
    requiresHumanPresence: envelope.physical?.requiresHumanPresence ?? envelope.requiresHumanPresence,
  };
}

/** Return the minimum of two optional numbers, or whichever is defined. */
function mergeMin(a?: number, b?: number): number | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return Math.min(a, b);
}

/**
 * Merge two constraint envelopes. The tighter constraint wins for each field.
 * Used for dynamic runtime tightening -- can only reduce, never widen.
 */
export function mergeConstraintEnvelopes(
  base: ConstraintEnvelope,
  override: Partial<ConstraintEnvelope>,
): ConstraintEnvelope {
  return {
    ...base,
    version: base.version,
    mode: base.mode,
    physical: {
      ...base.physical,
      ...override.physical,
      maxVelocityMps: mergeMin(base.physical?.maxVelocityMps, override.physical?.maxVelocityMps),
      maxForceNewtons: mergeMin(base.physical?.maxForceNewtons, override.physical?.maxForceNewtons),
      rateLimit: base.physical?.rateLimit && override.physical?.rateLimit
        ? {
            maxCalls: Math.min(base.physical.rateLimit.maxCalls, override.physical.rateLimit.maxCalls),
            windowMs: Math.min(base.physical.rateLimit.windowMs, override.physical.rateLimit.windowMs),
          }
        : override.physical?.rateLimit ?? base.physical?.rateLimit,
    },
    behavioral: {
      ...base.behavioral,
      ...override.behavioral,
      maxPayloadBytes: mergeMin(base.behavioral?.maxPayloadBytes, override.behavioral?.maxPayloadBytes),
      maxRatePerMinute: mergeMin(base.behavioral?.maxRatePerMinute, override.behavioral?.maxRatePerMinute),
    },
    dynamic: {
      tightenOnly: base.dynamic?.tightenOnly ?? override.dynamic?.tightenOnly ?? true,
      ...base.dynamic,
      ...override.dynamic,
    },
    // Legacy fields -- merge min
    maxVelocityMps: mergeMin(base.maxVelocityMps, override.maxVelocityMps),
    maxForceNewtons: mergeMin(base.maxForceNewtons, override.maxForceNewtons),
    maxDeviationMeters: mergeMin(base.maxDeviationMeters, override.maxDeviationMeters),
  };
}

/**
 * Check if a runtime override would widen any constraint beyond the base envelope.
 * Returns list of fields that violate the tighten-only invariant.
 */
export function checkTightenOnlyViolations(
  base: ConstraintEnvelope,
  proposed: Partial<ConstraintEnvelope>,
): readonly string[] {
  const violations: string[] = [];

  const checkWider = (fieldName: string, baseVal?: number, proposedVal?: number): void => {
    if (baseVal !== undefined && proposedVal !== undefined && proposedVal > baseVal) {
      violations.push(`${fieldName}: ${proposedVal} exceeds base ${baseVal}`);
    }
  };

  checkWider("physical.maxVelocityMps", base.physical?.maxVelocityMps, proposed.physical?.maxVelocityMps);
  checkWider("physical.maxForceNewtons", base.physical?.maxForceNewtons, proposed.physical?.maxForceNewtons);
  checkWider("behavioral.maxPayloadBytes", base.behavioral?.maxPayloadBytes, proposed.behavioral?.maxPayloadBytes);
  checkWider("behavioral.maxRatePerMinute", base.behavioral?.maxRatePerMinute, proposed.behavioral?.maxRatePerMinute);
  checkWider("maxVelocityMps", base.maxVelocityMps, proposed.maxVelocityMps);
  checkWider("maxForceNewtons", base.maxForceNewtons, proposed.maxForceNewtons);
  checkWider("maxDeviationMeters", base.maxDeviationMeters, proposed.maxDeviationMeters);

  if (base.physical?.rateLimit && proposed.physical?.rateLimit) {
    checkWider("physical.rateLimit.maxCalls", base.physical.rateLimit.maxCalls, proposed.physical.rateLimit.maxCalls);
    checkWider("physical.rateLimit.windowMs", base.physical.rateLimit.windowMs, proposed.physical.rateLimit.windowMs);
  }

  return violations;
}
