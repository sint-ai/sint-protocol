import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ApprovalTier,
  KINETIC_CAPACITY_EXCEEDED,
  kineticEnvelopeResultSchema,
  kineticReceiptSchema,
  type KineticEnvelopeResult,
  type KineticTightenedConstraints,
  type SupervisionLevel,
} from "@pshkv/core";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const FIXTURE_PATH = resolve(
  ROOT,
  "spec/kinetic-envelope/conformance/ros2-reference-v0.1.json",
);

const PROFILE = {
  vMaxMps: 1.5,
  fMaxN: 150,
  tauMaxNm: 40,
  omegaMaxRps: 2.0,
  eBase: 1.0,
  dSafeM: 1.0,
  mAllow: 0.5,
  metacognitiveFloor: 0.33,
  assistedFloor: 0.15,
} as const;

type DecisionAction = "allow" | "deny" | "escalate";
type MarginBand = "safe" | "approaching" | "over";

interface KineticFixture {
  readonly profile: "ros2-reference-v0.1";
  readonly note: string;
  readonly vectors: readonly KineticVector[];
}

interface KineticVector {
  readonly id: string;
  readonly note: string;
  readonly request: {
    readonly resource: string;
    readonly action: string;
    readonly physicalContext: {
      readonly currentVelocityMps?: number;
      readonly currentForceNewtons?: number;
      readonly currentTorqueNm?: number;
      readonly currentAngularVelocityRps?: number;
      readonly humanDetected?: boolean;
      readonly nearestObstacleMeters?: number;
      readonly trajectoryNovel?: boolean;
    };
  };
  readonly expect: {
    readonly referenceMargin: number;
    readonly marginBand: MarginBand;
    readonly supervision: SupervisionLevel;
    readonly decision: DecisionAction;
    readonly policyCode?: typeof KINETIC_CAPACITY_EXCEEDED;
    readonly capacityKnown: boolean;
    readonly tightenedAtMost?: KineticTightenedConstraints;
  };
}

function loadFixture(): KineticFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as KineticFixture;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function supervisionForMargin(margin: number, capacityKnown: boolean): SupervisionLevel {
  let supervision: SupervisionLevel;
  if (margin <= 0) supervision = "silent_veto";
  else if (margin >= PROFILE.mAllow) supervision = "stable";
  else if (margin >= PROFILE.metacognitiveFloor) supervision = "metacognitive";
  else if (margin >= PROFILE.assistedFloor) supervision = "assisted";
  else supervision = "regulated";

  if (!capacityKnown && (supervision === "stable" || supervision === "metacognitive")) {
    return "assisted";
  }
  return supervision;
}

function decisionForSupervision(supervision: SupervisionLevel): DecisionAction {
  if (supervision === "stable") return "allow";
  if (supervision === "silent_veto") return "deny";
  return "escalate";
}

function marginBandFor(margin: number): MarginBand {
  if (margin <= 0) return "over";
  if (margin >= PROFILE.mAllow) return "safe";
  return "approaching";
}

function computeReferenceEnvelope(vector: KineticVector): KineticEnvelopeResult {
  const ctx = vector.request.physicalContext;
  const autonomyDemand = Math.max(
    (ctx.currentVelocityMps ?? 0) / PROFILE.vMaxMps,
    (ctx.currentForceNewtons ?? 0) / PROFILE.fMaxN,
    (ctx.currentTorqueNm ?? 0) / PROFILE.tauMaxNm,
    Math.abs(ctx.currentAngularVelocityRps ?? 0) / PROFILE.omegaMaxRps,
  );
  const proximity = clamp((ctx.nearestObstacleMeters ?? 0) / PROFILE.dSafeM, 0, 1);
  const human = ctx.humanDetected ? 0.5 : 1;
  const novelty = ctx.trajectoryNovel ? 0.6 : 1;
  const environmentalCapacity = PROFILE.eBase * proximity * human * novelty;
  const capacityKnown = ctx.trajectoryNovel !== true && ctx.nearestObstacleMeters !== undefined;
  const margin =
    environmentalCapacity > 0 ? 1 - autonomyDemand / environmentalCapacity : Number.NEGATIVE_INFINITY;
  const supervision = supervisionForMargin(margin, capacityKnown);
  const tightenedConstraints: KineticTightenedConstraints = {};

  if (ctx.currentVelocityMps !== undefined && margin > 0) {
    tightenedConstraints.maxVelocityMps = round3(PROFILE.vMaxMps * clamp(margin, 0, 1));
  }
  if (ctx.currentForceNewtons !== undefined && margin > 0) {
    tightenedConstraints.maxForceNewtons = round3(PROFILE.fMaxN * clamp(margin, 0, 1));
  }
  if (ctx.currentTorqueNm !== undefined && margin > 0) {
    tightenedConstraints.maxTorqueNm = round3(PROFILE.tauMaxNm * clamp(margin, 0, 1));
  }

  return {
    autonomyDemand: round3(autonomyDemand),
    environmentalCapacity: round3(environmentalCapacity),
    margin: round3(margin),
    capacityKnown,
    tightenedConstraints,
    supervision,
    rationale: [vector.note],
  };
}

function expectTightenedAtMost(
  actual: KineticTightenedConstraints,
  ceilings: KineticTightenedConstraints | undefined,
): void {
  if (!ceilings) return;
  for (const [key, ceiling] of Object.entries(ceilings)) {
    if (typeof ceiling !== "number") continue;
    const actualValue = actual[key as keyof KineticTightenedConstraints];
    expect(typeof actualValue, key).toBe("number");
    expect(actualValue as number, key).toBeLessThanOrEqual(ceiling);
  }
}

describe("Kinetic envelope conformance vectors", () => {
  const fixture = loadFixture();

  it("loads the ROS2 reference fixture with the unknown-capacity clamp case", () => {
    expect(fixture.profile).toBe("ros2-reference-v0.1");
    expect(fixture.vectors.map((v) => v.id)).toEqual([
      "V1-cmd_vel-safe",
      "V2-cmd_vel-near-margin",
      "V3-human-near",
      "V4-force-over-limit",
      "V5-obstacle-proximity",
      "V6-torque-over-limit",
      "V7-novel-workspace-unknown-capacity",
    ]);
  });

  for (const vector of fixture.vectors) {
    it(`${vector.id}: produces the expected decision surface`, () => {
      const result = computeReferenceEnvelope(vector);
      const parsed = kineticEnvelopeResultSchema.parse(result);
      const decision = decisionForSupervision(parsed.supervision);
      const policyCode =
        parsed.supervision === "silent_veto" ? KINETIC_CAPACITY_EXCEEDED : undefined;

      expect(parsed.margin).toBeCloseTo(vector.expect.referenceMargin, 3);
      expect(marginBandFor(parsed.margin)).toBe(vector.expect.marginBand);
      expect(parsed.supervision).toBe(vector.expect.supervision);
      expect(decision).toBe(vector.expect.decision);
      expect(policyCode).toBe(vector.expect.policyCode);
      expect(parsed.capacityKnown).toBe(vector.expect.capacityKnown);
      expectTightenedAtMost(parsed.tightenedConstraints, vector.expect.tightenedAtMost);

      const receipt = kineticReceiptSchema.parse({
        requestId: vector.id,
        autonomyDemand: parsed.autonomyDemand,
        environmentalCapacity: parsed.environmentalCapacity,
        margin: parsed.margin,
        capacityKnown: parsed.capacityKnown,
        supervision: parsed.supervision,
        finalTier: decision === "allow" ? ApprovalTier.T1_PREPARE : ApprovalTier.T2_ACT,
        deautomated: decision === "escalate",
        vetoed: decision === "deny",
        policyCode,
        rationale: parsed.rationale,
      });
      expect(receipt.vetoed).toBe(vector.expect.decision === "deny");
    });
  }
});
