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
  SceneAwareNavigationModelOptions,
} from "./types.js";

/** Digest of the exact approved fixed stress-case policy. */
export function navigationScenarioPolicyDigest(policy: NavigationScenarioPolicy): string {
  return hashSha256(canonicalJsonStringify(policy));
}

function validDelta(value: number | undefined, limit: number): boolean {
  return value === undefined || (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= limit);
}

export function isValidNavigationScenarioPolicy(value: unknown): value is NavigationScenarioPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const policy = value as Partial<NavigationScenarioPolicy>;
  if (policy.version !== "1.0.0" || typeof policy.policyId !== "string"
    || !policy.policyId.trim() || policy.policyId.length > 128
    || Object.keys(policy).some((key) => !["version", "policyId", "cases"].includes(key))
    || !Array.isArray(policy.cases) || policy.cases.length < 1 || policy.cases.length > 16) return false;
  const ids = new Set<string>();
  for (const scenario of policy.cases) {
    if (!scenario || typeof scenario !== "object" || Array.isArray(scenario)
      || typeof scenario.id !== "string" || !scenario.id.trim() || scenario.id.length > 128
      || scenario.id === "observed" || ids.has(scenario.id)
      || Object.keys(scenario).some((key) => !["id", "extraRobotRadiusMeters", "extraReactionTimeMs", "extraHumanSpeedMps"].includes(key))
      || !validDelta(scenario.extraRobotRadiusMeters, 10)
      || !validDelta(scenario.extraReactionTimeMs, 30_000)
      || !validDelta(scenario.extraHumanSpeedMps, 20)
      || ![scenario.extraRobotRadiusMeters, scenario.extraReactionTimeMs, scenario.extraHumanSpeedMps]
        .some((value) => value !== undefined && value > 0)) return false;
    ids.add(scenario.id);
  }
  return true;
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

/**
 * Runs the observed scene plus a bounded set of fixed adversarial envelope cases.
 * The model remains deterministic; its coverage is finite case coverage only.
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
      return err({ code: "SIMULATOR_MISCONFIGURED", message: "Fixed navigation scenario policy is invalid", retryable: false });
    }
    const runs: Array<{ id: string; value: DeterministicCheckResult }> = [];
    const observed = await new SceneAwareNavigationModel(this.options).evaluate(effectPlan, worldSnapshot);
    if (!observed.ok) return observed;
    runs.push({ id: "observed", value: observed.value });
    for (const scenario of this.policy.cases) {
      const evaluated = await new SceneAwareNavigationModel(stressedOptions(this.options, scenario))
        .evaluate(effectPlan, worldSnapshot);
      if (!evaluated.ok) return evaluated;
      runs.push({ id: scenario.id, value: evaluated.value });
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
    return ok({
      checks: runs.flatMap((run) => run.value.checks.map((check) => ({ ...check, check: `${run.id}:${check.check}` }))),
      scenarios: {
        scenarioSetDigest: navigationScenarioPolicyDigest(this.policy),
        runCount: runs.length,
        coverage: conclusive / runs.length,
        seeds: [],
      },
      scenarioPolicy: this.policy,
      result: {
        outcome,
        collisions: Math.max(...results.map((result) => result.collisions)),
        safetyZoneViolations: Math.max(...results.map((result) => result.safetyZoneViolations)),
        ...(clearances.length > 0 && { minClearanceMeters: Math.min(...clearances) }),
        ...(maxVelocities.length > 0 && { maxVelocityMps: Math.max(...maxVelocities) }),
        assumptions: [
          "Coverage denotes conclusive fixed adversarial cases, not probability mass or field risk calibration",
          ...new Set(results.flatMap((result) => result.assumptions ?? [])),
        ],
        unsupportedPhenomena: [...new Set(results.flatMap((result) => result.unsupportedPhenomena ?? []))],
      },
    });
  }
}
