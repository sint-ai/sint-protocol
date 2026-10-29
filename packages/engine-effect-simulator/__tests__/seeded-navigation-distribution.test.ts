import { describe, expect, it } from "vitest";
import { isValidNavigationScenarioPolicy, sampleNavigationPerturbations } from "../src/index.js";
import type { NavigationScenarioPolicy, SeededNavigationDistribution } from "../src/index.js";

function policy(overrides: Record<string, unknown> = {}): NavigationScenarioPolicy {
  return {
    version: "1.0.0",
    policyId: "seeded-nav-v1",
    cases: [{ id: "larger-footprint", extraRobotRadiusMeters: 0.05 }],
    distribution: {
      version: "1.0.0",
      seeds: [7, 11],
      bounds: {
        extraRobotRadiusMeters: { min: 0, max: 0.2 },
        extraReactionTimeMs: { min: 0, max: 50 },
        extraHumanSpeedMps: { min: 0, max: 0.2 },
      },
    },
    ...overrides,
  } as NavigationScenarioPolicy;
}

function distributionOf(value: NavigationScenarioPolicy): SeededNavigationDistribution {
  if (!value.distribution) throw new Error("expected a seeded distribution");
  return value.distribution;
}

describe("seeded navigation perturbation policy", () => {
  it("accepts unique seeds whose bounds stay inside the approved stress limits", () => {
    expect(isValidNavigationScenarioPolicy(policy())).toBe(true);
  });

  it("rejects a duplicated seed", () => {
    const duplicated = policy();
    const distribution = distributionOf(duplicated) as unknown as { seeds: number[] };
    distribution.seeds = [7, 7];
    expect(isValidNavigationScenarioPolicy(duplicated)).toBe(false);
  });

  it("rejects a perturbation bound outside the approved support", () => {
    const outside = policy();
    const distribution = distributionOf(outside) as unknown as {
      bounds: { extraHumanSpeedMps: { max: number } };
    };
    distribution.bounds.extraHumanSpeedMps.max = 21;
    expect(isValidNavigationScenarioPolicy(outside)).toBe(false);
  });

  it("rejects a seeded policy that pushes the fixed-case budget past 16 runs", () => {
    const crowded = policy({
      cases: Array.from({ length: 16 }, (_, index) => ({
        id: `case-${index}`,
        extraRobotRadiusMeters: 0.01,
      })),
    });
    expect(isValidNavigationScenarioPolicy(crowded)).toBe(false);
  });

  it("redraws the same in-bound perturbation for the same seed", () => {
    const distribution = distributionOf(policy());
    const first = sampleNavigationPerturbations(distribution);
    const second = sampleNavigationPerturbations(distribution);
    expect(second).toEqual(first);
    expect(first.map((sample) => sample.id)).toEqual(["seed:7", "seed:11"]);
    for (const sample of first) {
      expect(sample.extraRobotRadiusMeters).toBeGreaterThanOrEqual(0);
      expect(sample.extraRobotRadiusMeters).toBeLessThanOrEqual(0.2);
      expect(sample.extraReactionTimeMs).toBeGreaterThanOrEqual(0);
      expect(sample.extraReactionTimeMs).toBeLessThanOrEqual(50);
      expect(sample.extraHumanSpeedMps).toBeGreaterThanOrEqual(0);
      expect(sample.extraHumanSpeedMps).toBeLessThanOrEqual(0.2);
    }
  });
});
