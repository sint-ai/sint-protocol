import {
  canonicalJsonStringify,
  err,
  ok,
  type EffectPlan,
  type EffectSimulationError,
  type Result,
  type SimulationSafetyResult,
  type SimulationWorldSnapshot,
} from "@pshkv/core";
import { hashSha256 } from "@pshkv/gate-capability-tokens";
import { BoundedMotionEffectModel } from "./bounded-motion-model.js";
import type {
  BoundedMotionEffectModelOptions,
  BoundedMotionScenarioPolicy,
  BoundedMotionStressCase,
  DeterministicCheckResult,
  DeterministicEffectModel,
  NumericRange,
  SeededBoundedMotionDistribution,
} from "./types.js";

function validDelta(value: number | undefined, limit: number): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= limit);
}

function validRange(value: unknown, limit: number): value is NumericRange {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const range = value as Partial<NumericRange>;
  return Object.keys(range).length === 2
    && typeof range.min === "number" && typeof range.max === "number"
    && Number.isFinite(range.min) && Number.isFinite(range.max)
    && range.min >= 0 && range.max >= range.min && range.max <= limit;
}

function isValidDistribution(value: unknown): value is SeededBoundedMotionDistribution {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const distribution = value as Partial<SeededBoundedMotionDistribution>;
  if (distribution.version !== "1.0.0"
    || Object.keys(distribution).some((key) => !["version", "seeds", "bounds"].includes(key))
    || !Array.isArray(distribution.seeds)
    || distribution.seeds.length < 1
    || distribution.seeds.length > 16) return false;
  const seen = new Set<number>();
  for (const seed of distribution.seeds) {
    if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xFFFFFFFF || seen.has(seed)) return false;
    seen.add(seed);
  }
  const bounds = distribution.bounds as Record<string, unknown> | undefined;
  if (!bounds || typeof bounds !== "object" || Array.isArray(bounds) || Object.keys(bounds).length !== 3) return false;
  const force = bounds.extraForceNewtons;
  const velocity = bounds.extraVelocityMps;
  const clearance = bounds.reducedClearanceMeters;
  if (!validRange(force, 10_000) || !validRange(velocity, 20) || !validRange(clearance, 10)) return false;
  return force.max > 0 || velocity.max > 0 || clearance.max > 0;
}

export function isValidBoundedMotionScenarioPolicy(value: unknown): value is BoundedMotionScenarioPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const policy = value as Partial<BoundedMotionScenarioPolicy>;
  if (policy.version !== "1.0.0" || typeof policy.policyId !== "string"
    || !policy.policyId.trim() || policy.policyId.length > 128
    || Object.keys(policy).some((key) => !["version", "policyId", "cases", "distribution"].includes(key))
    || !Array.isArray(policy.cases) || policy.cases.length < 1) return false;
  if (policy.distribution !== undefined && !isValidDistribution(policy.distribution)) return false;
  const seedCount = policy.distribution?.seeds.length ?? 0;
  if (policy.cases.length + seedCount > 16) return false;
  const ids = new Set<string>();
  for (const scenario of policy.cases) {
    if (!scenario || typeof scenario !== "object" || Array.isArray(scenario)
      || typeof scenario.id !== "string" || !scenario.id.trim() || scenario.id.length > 128
      || scenario.id === "observed" || scenario.id.startsWith("seed:") || ids.has(scenario.id)
      || Object.keys(scenario).some((key) => !["id", "extraForceNewtons", "extraVelocityMps", "reducedClearanceMeters"].includes(key))
      || !validDelta(scenario.extraForceNewtons, 10_000)
      || !validDelta(scenario.extraVelocityMps, 20)
      || !validDelta(scenario.reducedClearanceMeters, 10)
      || ![scenario.extraForceNewtons, scenario.extraVelocityMps, scenario.reducedClearanceMeters]
        .some((delta) => delta !== undefined && delta > 0)) return false;
    ids.add(scenario.id);
  }
  return true;
}

function mix32(value: number): number {
  let mixed = value >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846ca68b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

function draw(seed: number, lane: number, range: NumericRange): number {
  const mixed = mix32((seed ^ Math.imul(lane + 1, 0x9e3779b9)) >>> 0);
  const steps = 1_000;
  const bucket = Math.min(steps, Math.floor((mixed / 4_294_967_296) * (steps + 1)));
  const value = range.min + (bucket / steps) * (range.max - range.min);
  return Math.round(value * 1e6) / 1e6;
}

/** One deterministic perturbation per approved seed. The same seed always redraws the same case. */
export function sampleBoundedMotionPerturbations(
  distribution: SeededBoundedMotionDistribution,
): BoundedMotionStressCase[] {
  return distribution.seeds.map((seed) => ({
    id: `seed:${seed}`,
    extraForceNewtons: draw(seed, 0, distribution.bounds.extraForceNewtons),
    extraVelocityMps: draw(seed, 1, distribution.bounds.extraVelocityMps),
    reducedClearanceMeters: draw(seed, 2, distribution.bounds.reducedClearanceMeters),
  }));
}

/** Digest of the exact approved bounded-motion stress-case and seeded-perturbation policy. */
export function boundedMotionScenarioPolicyDigest(policy: BoundedMotionScenarioPolicy): string {
  return hashSha256(canonicalJsonStringify(policy));
}

function addNumber(params: Record<string, unknown>, key: string, delta: number | undefined): void {
  const current = params[key];
  if (typeof current === "number") params[key] = current + (delta ?? 0);
}

function stressedPlan(effectPlan: EffectPlan, scenario: BoundedMotionStressCase): EffectPlan {
  const params = { ...effectPlan.params };
  addNumber(params, "forceNewtons", scenario.extraForceNewtons);
  addNumber(params, "velocityMps", scenario.extraVelocityMps);
  const clearance = params.clearanceMeters;
  if (typeof clearance === "number") params.clearanceMeters = clearance - (scenario.reducedClearanceMeters ?? 0);
  return { ...effectPlan, params };
}

function withDrawnPerturbation(
  evaluated: DeterministicCheckResult,
  scenario: BoundedMotionStressCase,
): DeterministicCheckResult {
  if (!scenario.id.startsWith("seed:")) return evaluated;
  return {
    ...evaluated,
    checks: [
      {
        check: "perturbation",
        status: "pass",
        observed: {
          extraForceNewtons: scenario.extraForceNewtons ?? 0,
          extraVelocityMps: scenario.extraVelocityMps ?? 0,
          reducedClearanceMeters: scenario.reducedClearanceMeters ?? 0,
        },
      },
      ...evaluated.checks,
    ],
  };
}

/**
 * Runs the observed command, the fixed adversarial cases, and one sample per approved seed.
 * Coverage is the fraction of those runs that finished conclusively. It is not a probability.
 */
export class FixedCaseBoundedMotionModel implements DeterministicEffectModel {
  readonly id: string;

  constructor(
    private readonly options: BoundedMotionEffectModelOptions,
    private readonly policy: BoundedMotionScenarioPolicy,
  ) {
    this.id = `${options.id ?? "bounded-motion-v1"}:fixed-cases:${policy.policyId}`;
  }

  supports(effectPlan: EffectPlan): boolean {
    return new BoundedMotionEffectModel(this.options).supports(effectPlan);
  }

  async evaluate(
    effectPlan: EffectPlan,
    worldSnapshot: SimulationWorldSnapshot,
  ): Promise<Result<DeterministicCheckResult, EffectSimulationError>> {
    if (!isValidBoundedMotionScenarioPolicy(this.policy)) {
      return err({ code: "SIMULATOR_MISCONFIGURED", message: "Bounded-motion scenario policy is invalid", retryable: false });
    }
    const samples = this.policy.distribution ? sampleBoundedMotionPerturbations(this.policy.distribution) : [];
    const runs: Array<{ id: string; value: DeterministicCheckResult }> = [];
    const observed = await new BoundedMotionEffectModel(this.options).evaluate(effectPlan, worldSnapshot);
    if (!observed.ok) return observed;
    runs.push({ id: "observed", value: observed.value });
    for (const scenario of [...this.policy.cases, ...samples]) {
      const evaluated = await new BoundedMotionEffectModel(this.options)
        .evaluate(stressedPlan(effectPlan, scenario), worldSnapshot);
      if (!evaluated.ok) return evaluated;
      runs.push({ id: scenario.id, value: withDrawnPerturbation(evaluated.value, scenario) });
    }

    const results = runs.map((run) => run.value.result);
    const outcome: SimulationSafetyResult["outcome"] = results.some((result) => result.outcome === "fail")
      ? "fail"
      : results.some((result) => result.outcome === "indeterminate") ? "indeterminate" : "pass";
    const clearances = results.map((result) => result.minClearanceMeters)
      .filter((value): value is number => value !== undefined);
    const maxVelocities = results.map((result) => result.maxVelocityMps)
      .filter((value): value is number => value !== undefined);
    const maxForces = results.map((result) => result.maxForceNewtons)
      .filter((value): value is number => value !== undefined);
    const conclusive = results.filter((result) => result.outcome !== "indeterminate").length;
    return ok({
      checks: runs.flatMap((run) => run.value.checks.map((check) => ({ ...check, check: `${run.id}:${check.check}` }))),
      scenarios: {
        scenarioSetDigest: boundedMotionScenarioPolicyDigest(this.policy),
        runCount: runs.length,
        coverage: conclusive / runs.length,
        seeds: [...(this.policy.distribution?.seeds ?? [])],
      },
      scenarioPolicy: this.policy,
      result: {
        outcome,
        collisions: Math.max(...results.map((result) => result.collisions)),
        safetyZoneViolations: Math.max(...results.map((result) => result.safetyZoneViolations)),
        ...(clearances.length > 0 && { minClearanceMeters: Math.min(...clearances) }),
        ...(maxVelocities.length > 0 && { maxVelocityMps: Math.max(...maxVelocities) }),
        ...(maxForces.length > 0 && { maxForceNewtons: Math.max(...maxForces) }),
        assumptions: [
          "Coverage is the fraction of conclusive fixed cases and seeded perturbations, not a collision probability or field-risk estimate",
          ...new Set(results.flatMap((result) => result.assumptions ?? [])),
        ],
        unsupportedPhenomena: [...new Set(results.flatMap((result) => result.unsupportedPhenomena ?? []))],
      },
    });
  }
}
