/**
 * SINT Protocol — Plan Constraint Checker.
 *
 * Validates plan steps against token-defined physical constraints
 * (force limits, velocity limits, geofence boundaries).
 *
 * @module @sint/engine-system2/planner/constraint-checker
 */

import type { Result, SintPlan } from "@sint/core";
import { ok, err } from "@sint/core";

/** Physical constraints derived from capability tokens. */
export interface TokenConstraints {
  /** Maximum force the agent may command, in Newtons. */
  readonly maxForceNewtons?: number;
  /** Maximum velocity the agent may command, in m/s. */
  readonly maxVelocityMps?: number;
  /** Geofence polygon the agent must stay within. */
  readonly geofence?: {
    readonly coordinates: readonly (readonly [number, number])[];
  };
}

/**
 * Validates plan steps against physical constraints.
 *
 * @example
 * ```ts
 * const checker = new PlanConstraintChecker();
 * const result = checker.checkPlanConstraints(plan, {
 *   maxForceNewtons: 50,
 *   maxVelocityMps: 1.0,
 * });
 * if (!result.ok) {
 *   console.error(result.error.message);
 * }
 * ```
 */
export class PlanConstraintChecker {
  /**
   * Validate every step of a plan against token physical constraints.
   *
   * @param plan - The plan to check.
   * @param constraints - Physical limits from the capability token.
   * @returns The plan if valid, or an error identifying the violating step.
   *
   * @example
   * ```ts
   * const result = checker.checkPlanConstraints(plan, { maxForceNewtons: 100 });
   * ```
   */
  checkPlanConstraints(
    plan: SintPlan,
    constraints: TokenConstraints,
  ): Result<SintPlan, Error> {
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      if (step === undefined) {
        continue;
      }

      // Check force constraint
      if (constraints.maxForceNewtons !== undefined) {
        const force = step.params["forceNewtons"];
        if (typeof force === "number" && force > constraints.maxForceNewtons) {
          return err(
            new Error(
              `Step ${i} ("${step.action}") violates force constraint: ` +
              `${force}N exceeds maximum ${constraints.maxForceNewtons}N`,
            ),
          );
        }
      }

      // Check velocity constraint
      if (constraints.maxVelocityMps !== undefined) {
        const velocity = step.params["velocityMps"];
        if (
          typeof velocity === "number" &&
          velocity > constraints.maxVelocityMps
        ) {
          return err(
            new Error(
              `Step ${i} ("${step.action}") violates velocity constraint: ` +
              `${velocity}m/s exceeds maximum ${constraints.maxVelocityMps}m/s`,
            ),
          );
        }
      }

      // Check geofence constraint
      if (constraints.geofence !== undefined) {
        const targetX = step.params["targetX"];
        const targetY = step.params["targetY"];
        if (typeof targetX === "number" && typeof targetY === "number") {
          if (
            !this._isInsideGeofence(
              targetX,
              targetY,
              constraints.geofence.coordinates,
            )
          ) {
            return err(
              new Error(
                `Step ${i} ("${step.action}") violates geofence constraint: ` +
                `target (${targetX}, ${targetY}) is outside the permitted area`,
              ),
            );
          }
        }
      }
    }

    return ok(plan);
  }

  /**
   * Ray-casting point-in-polygon test.
   */
  private _isInsideGeofence(
    x: number,
    y: number,
    polygon: readonly (readonly [number, number])[],
  ): boolean {
    if (polygon.length < 3) {
      return false;
    }

    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const pi = polygon[i];
      const pj = polygon[j];
      if (pi === undefined || pj === undefined) continue;

      const xi = pi[0];
      const yi = pi[1];
      const xj = pj[0];
      const yj = pj[1];

      const intersect =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

      if (intersect) {
        inside = !inside;
      }
    }

    return inside;
  }
}
