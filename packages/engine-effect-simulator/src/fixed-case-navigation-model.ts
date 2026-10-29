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
import { SceneAwareNavigationModel } from "./scene-aware-navigation-model.js";
import type {
  DeterministicCheckResult,
  DeterministicEffectModel,
  NavigationScenarioPolicy,
  NavigationStressCase,
  NumericRange,
  SceneAwareNavigationModelOptions,
  SeededNavigationDistribution,
} from "./types.js";

/** Digest of the exact approved stress-case and seeded-perturbation policy. */
export function navigationScenarioPolicyDigest(policy: NavigationScenarioPolicy): string {
  return hashSha256(canonicalJsonStringify(policy));
}

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

function isValidDistribution(value: unknown): value is SeededNavigationDistribution {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const distribution = value as Partial<SeededNavigationDistribution>;
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
  const radius = bounds.extraRobotRadiusMeters;
  const reaction = bounds.extraReactionTimeMs;
  const human = bounds.extraHumanSpeedMps;
  if (!validRange(radius, 10) || !validRange(reaction, 30_000) || !validRange(human, 20)) return false;
  return radius.max > 0 || reaction.max > 0 || human.max > 0;
}

export function isValidNavigationScenarioPolicy(value: unknown): value is NavigationScenarioPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const policy = value as Partial<NavigationScenarioPolicy>;
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
      || Object.keys(scenario).some((key) => !["id", "extraRobotRadiusMeters", "extraReactionTimeMs", "extraHumanSpeedMps"].includes(key))
      || !validDelta(scenario.extraRobotRadiusMeters, 10)
      || !validDelta(scenario.extraReactionTimeMs, 30_000)
      || !validDelta(scenario.extraHumanSpeedMps, 20)
      || ![scenario.extraRobotRadiusMeters, scenario.extraReactionTimeMs, scenario.extraHumanSpeedMps]
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
export function sampleNavigationPerturbations(
  distribution: SeededNavigationDistribution,
): NavigationStressCase[] {
  return distribution.seeds.map((seed) => ({
    id: `seed:${seed}`,
    extraRobotRadiusMeters: draw(seed, 0, distribution.bounds.extraRobotRadiusMeters),
    extraReactionTimeMs: draw(seed, 1, distribution.bounds.extraReactionTimeMs),
    extraHumanSpeedMps: draw(seed, 2, distribution.bounds.extraHumanSpeedMps),
  }));
}

function stressedOptions(
  options: SceneAwareNavigationModelOptions,
  scenario: NavigationStressCase,
): SceneAwareNavigationModelOptions {
  return {
    ...options,
    robotRadiusMeters: options.robotRadiusMeters + (scenario.extraRobotRadiusMeters ?? 0),
    reactionTimeMs: options.reactionTimeMs + (scenario.extraReactionTimeMs ?? 0),
    maxHumanSpeedMps: options.maxHumanSpeedMps + (scenario.extraHumanSpeedMps ?? 0),
  };
}

function withDrawnPerturbation(
  evaluated: DeterministicCheckResult,
  scenario: NavigationStressCase,
): DeterministicCheckResult {
  if (!scenario.id.startsWith("seed:")) return evaluated;
  return {
    ...evaluated,
    checks: [
      {
        check: "perturbation",
        status: "pass",
        observed: {
          extraRobotRadiusMeters: scenario.extraRobotRadiusMeters ?? 0,
          extraReactionTimeMs: scenario.extraReactionTimeMs ?? 0,
          extraHumanSpeedMps: scenario.extraHumanSpeedMps ?? 0,
        },
      },
      ...evaluated.checks,
    ],
  };
}

/**
 * Runs the observed scene, the fixed adversarial cases, and one sample per approved seed.
 * Coverage is the fraction of those runs that finished conclusively. It is not a probability.
 */
export class FixedCaseNavigationModel implements DeterministicEffectModel {
  readonly id: string;

  constructor(
    private readonly options: SceneAwareNavigationModelOptions,
    private readonly policy: NavigationScenarioPolicy,
  ) {
    this.id = `${options.id ?? "scene-aware-navigation-v1"}:fixed-cases:${policy.policyId}`;
  }

  supports(effectPlan: EffectPlan): boolean {
    return new SceneAwareNavigationModel(this.options).supports(effectPlan);
  }

  async evaluate(
    effectPlan: EffectPlan,
    worldSnapshot: SimulationWorldSnapshot,
  ): Promise<Result<DeterministicCheckResult, EffectSimulationError>> {
    if (!isValidNavigationScenarioPolicy(this.policy)) {
      return err({ code: "SIMULATOR_MISCONFIGURED", message: "Navigation scenario policy is invalid", retryable: false });
    }
    const samples = this.policy.distribution ? sampleNavigationPerturbations(this.policy.distribution) : [];
    const runs: Array<{ id: string; value: DeterministicCheckResult }> = [];
    const observed = await new SceneAwareNavigationModel(this.options).evaluate(effectPlan, worldSnapshot);
    if (!observed.ok) return observed;
    runs.push({ id: "observed", value: observed.value });
    for (const scenario of [...this.policy.cases, ...samples]) {
      const evaluated = await new SceneAwareNavigationModel(stressedOptions(this.options, scenario))
        .evaluate(effectPlan, worldSnapshot);
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
    const conclusive = results.filter((result) => result.outcome !== "indeterminate").length;
    const coverageAssumption = this.policy.distribution
      ? "Coverage is the fraction of conclusive fixed cases and seeded perturbations, not a collision probability or field-risk estimate"
      : "Coverage denotes conclusive fixed adversarial cases, not probability mass or field risk calibration";
    return ok({
      checks: runs.flatMap((run) => run.value.checks.map((check) => ({ ...check, check: `${run.id}:${check.check}` }))),
      scenarios: {
        scenarioSetDigest: navigationScenarioPolicyDigest(this.policy),
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
        assumptions: [
          coverageAssumption,
          ...new Set(results.flatMap((result) => result.assumptions ?? [])),
        ],
        unsupportedPhenomena: [...new Set(results.flatMap((result) => result.unsupportedPhenomena ?? []))],
      },
    });
  }
}
