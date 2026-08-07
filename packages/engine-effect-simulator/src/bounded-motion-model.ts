import {
  err,
  ok,
  type EffectPlan,
  type EffectSimulationError,
  type Point3D,
  type Result,
  type SimulationSafetyResult,
  type SimulationWorldSnapshot,
} from "@pshkv/core";
import type {
  BoundedMotionEffectModelOptions,
  DeterministicCheckRecord,
  DeterministicCheckResult,
  DeterministicEffectModel,
  NumericRange,
} from "./types.js";

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function readNumber(params: Record<string, unknown>, key: string): number | undefined {
  const value = params[key];
  return isFiniteNumber(value) ? value : undefined;
}

function readPoint(value: unknown): Point3D | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const point = value as Record<string, unknown>;
  return isFiniteNumber(point.x) && isFiniteNumber(point.y) && isFiniteNumber(point.z)
    ? { x: point.x, y: point.y, z: point.z }
    : undefined;
}

function readJointPositions(value: unknown): Readonly<Record<string, number>> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0 || entries.some(([, position]) => !isFiniteNumber(position))) {
    return undefined;
  }
  return Object.fromEntries(entries) as Readonly<Record<string, number>>;
}

function inRange(value: number, range: NumericRange): boolean {
  return value >= range.min && value <= range.max;
}

function isValidRange(range: NumericRange): boolean {
  return Number.isFinite(range.min) && Number.isFinite(range.max) && range.min <= range.max;
}

function unknownCheck(check: string, expected: string): DeterministicCheckRecord {
  return { check, status: "unknown", expected };
}

function scalarCheck(
  check: string,
  observed: number | undefined,
  expected: string,
  passes: (value: number) => boolean,
): DeterministicCheckRecord {
  if (observed === undefined) return unknownCheck(check, expected);
  return { check, status: passes(observed) ? "pass" : "fail", observed, expected };
}

/**
 * Deterministic checker for bounded robot motion requests.
 *
 * Recognized params are `jointPositions`, `target`, `velocityMps`,
 * `forceNewtons`, `clearanceMeters`, `collisions`, and
 * `safetyZoneViolations`. Every configured envelope property must have a
 * corresponding observation; otherwise the result is indeterminate.
 */
export class BoundedMotionEffectModel implements DeterministicEffectModel {
  readonly id: string;

  constructor(private readonly options: BoundedMotionEffectModelOptions) {
    this.id = options.id ?? "bounded-motion-v1";
  }

  supports(effectPlan: EffectPlan): boolean {
    return this.options.actions.includes(effectPlan.action)
      && this.options.resources.some((resource) => typeof resource === "string"
        ? resource === effectPlan.resource
        : resource.test(effectPlan.resource));
  }

  evaluate(
    effectPlan: EffectPlan,
    _worldSnapshot: SimulationWorldSnapshot,
  ): Result<DeterministicCheckResult, EffectSimulationError> {
    const envelope = this.options.envelope;
    const params = effectPlan.params;
    const checks: DeterministicCheckRecord[] = [];

    const ranges = [
      ...Object.values(envelope.jointLimits ?? {}),
      ...(envelope.workspace
        ? [envelope.workspace.x, envelope.workspace.y, envelope.workspace.z]
        : []),
    ];
    const nonNegativeLimits = [
      envelope.maxVelocityMps,
      envelope.maxForceNewtons,
      envelope.minClearanceMeters,
      envelope.maxCollisions,
      envelope.maxSafetyZoneViolations,
    ].filter((value): value is number => value !== undefined);
    if (
      ranges.some((range) => !isValidRange(range))
      || nonNegativeLimits.some((value) => !Number.isFinite(value) || value < 0)
    ) {
      return err({
        code: "SIMULATOR_MISCONFIGURED",
        message: `Deterministic model ${this.id} contains invalid safety bounds`,
        retryable: false,
      });
    }

    if (envelope.jointLimits) {
      const positions = readJointPositions(params.jointPositions);
      if (!positions) {
        checks.push(unknownCheck("joint-limits", "jointPositions must contain finite joint values"));
      } else {
        const unknownJoints = Object.keys(positions).filter((joint) => envelope.jointLimits?.[joint] === undefined);
        const missingJoints = Object.keys(envelope.jointLimits).filter((joint) => positions[joint] === undefined);
        const withinLimits = unknownJoints.length === 0
          && missingJoints.length === 0
          && Object.entries(positions).every(([joint, position]) => inRange(position, envelope.jointLimits![joint]!));
        checks.push({
          check: "joint-limits",
          status: withinLimits ? "pass" : "fail",
          observed: positions,
          expected: "all configured joints present and within inclusive limits",
        });
      }
    }

    if (envelope.workspace) {
      const target = readPoint(params.target);
      if (!target) {
        checks.push(unknownCheck("workspace", "target must be a finite {x,y,z} point"));
      } else {
        const inside = inRange(target.x, envelope.workspace.x)
          && inRange(target.y, envelope.workspace.y)
          && inRange(target.z, envelope.workspace.z);
        checks.push({
          check: "workspace",
          status: inside ? "pass" : "fail",
          observed: target,
          expected: "target inside configured axis-aligned workspace",
        });
      }
    }

    if (envelope.maxVelocityMps !== undefined) {
      checks.push(scalarCheck(
        "max-velocity",
        readNumber(params, "velocityMps"),
        `velocityMps <= ${envelope.maxVelocityMps}`,
        (value) => value >= 0 && value <= envelope.maxVelocityMps!,
      ));
    }
    if (envelope.maxForceNewtons !== undefined) {
      checks.push(scalarCheck(
        "max-force",
        readNumber(params, "forceNewtons"),
        `forceNewtons <= ${envelope.maxForceNewtons}`,
        (value) => value >= 0 && value <= envelope.maxForceNewtons!,
      ));
    }
    if (envelope.minClearanceMeters !== undefined) {
      checks.push(scalarCheck(
        "minimum-clearance",
        readNumber(params, "clearanceMeters"),
        `clearanceMeters >= ${envelope.minClearanceMeters}`,
        (value) => value >= envelope.minClearanceMeters!,
      ));
    }

    const collisions = readNumber(params, "collisions");
    const maxCollisions = envelope.maxCollisions ?? 0;
    checks.push(scalarCheck(
      "collisions",
      collisions,
      `collisions <= ${maxCollisions}`,
      (value) => Number.isInteger(value) && value >= 0 && value <= maxCollisions,
    ));

    const safetyZoneViolations = readNumber(params, "safetyZoneViolations");
    const maxSafetyZoneViolations = envelope.maxSafetyZoneViolations ?? 0;
    checks.push(scalarCheck(
      "safety-zone-violations",
      safetyZoneViolations,
      `safetyZoneViolations <= ${maxSafetyZoneViolations}`,
      (value) => Number.isInteger(value) && value >= 0 && value <= maxSafetyZoneViolations,
    ));

    if (checks.length === 0) {
      return err({
        code: "SIMULATOR_MISCONFIGURED",
        message: `Deterministic model ${this.id} has no configured checks`,
        retryable: false,
      });
    }

    const hasUnknown = checks.some((check) => check.status === "unknown");
    const hasFailure = checks.some((check) => check.status === "fail");
    const outcome: SimulationSafetyResult["outcome"] = hasUnknown
      ? "indeterminate"
      : hasFailure ? "fail" : "pass";

    return ok({
      checks,
      result: {
        outcome,
        collisions: collisions ?? 0,
        safetyZoneViolations: safetyZoneViolations ?? 0,
        ...(readNumber(params, "forceNewtons") !== undefined && {
          maxForceNewtons: readNumber(params, "forceNewtons"),
        }),
        ...(readNumber(params, "velocityMps") !== undefined && {
          maxVelocityMps: readNumber(params, "velocityMps"),
        }),
        ...(readNumber(params, "clearanceMeters") !== undefined && {
          minClearanceMeters: readNumber(params, "clearanceMeters"),
        }),
        assumptions: [
          "Request parameters are treated as the commanded maxima and endpoint state",
          "World snapshot digest and freshness are trusted inputs to this worker",
        ],
        unsupportedPhenomena: [
          "dynamic actor motion",
          "actuator lag and control-loop dynamics",
          "material deformation and contact physics",
        ],
      },
    });
  }
}
