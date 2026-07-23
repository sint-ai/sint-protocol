# Kinetic Envelope — interface + conformance (v0.1)

Spec slice for physics-aware tier assignment, proposed in sint-ai/sint-protocol#241.

It adds an opt-in envelope step that reads an action's kinetic parameters, tightens the executable envelope, and sets a supervision level. As autonomy demand `A` climbs toward environmental capacity `E`, supervision rises (deautomation). At `A > E` the action gets a silent veto. Register a `KineticEnvelopePlugin` to turn it on. With no plugin registered, the gateway runs the way it does today.

This branch is spec plus fixtures. It does not wire `supervision` into `assignTier`. That is step 4, after these vectors pass.

## Types

Opt-in surface. A registered plugin returns a `KineticEnvelopeResult`; the gateway min-merges `tightenedConstraints` into the token envelope and reads `supervision`.

```ts
export type SupervisionLevel =
  | "stable"        // full autonomy under the token envelope
  | "metacognitive" // agent self-check before actuation
  | "assisted"      // human/agent consensus in the loop
  | "regulated"     // external authorization to proceed
  | "silent_veto";  // no autonomous or supervised path; action not carried

export interface JointLimit {
  joint: string;
  maxPositionRad?: number;
  maxVelocityRps?: number;
  maxEffortNm?: number;
}

export interface TightenedConstraints {
  maxVelocityMps?: number;
  maxForceNewtons?: number;
  maxTorqueNm?: number;
  maxJerkMps3?: number;
  maxAngularVelocityRps?: number;
  jointLimits?: JointLimit[];
  proximityMinMeters?: number;
}

export interface KineticEnvelopeResult {
  autonomyDemand: number;         // A >= 0
  environmentalCapacity: number;  // E >= 0
  margin: number;                 // 1 - A/E for E > 0; <= 0 means over capacity
  capacityKnown: boolean;         // false when E is estimated (novelty or missing sensing)
  tightenedConstraints: TightenedConstraints; // tighten-only
  supervision: SupervisionLevel;
  rationale: string[];
}

export interface KineticEnvelopePlugin {
  computeEnvelope(request: SintRequest): Promise<KineticEnvelopeResult>;
}
```

The provider reads these from `SintRequest.physicalContext`: `currentVelocityMps`, `currentForceNewtons`, `currentTorqueNm`, `currentJerkMps3`, `jointStates`, `nearestObstacleMeters`, `humanDetected`, `trajectoryNovel`. A missing signal that a class needs sets `capacityKnown = false`.

## Deny code

```ts
// Stays in the deny family, so existing deny handling still catches it.
// The distinct code lets audits and alerting tell a physics veto apart
// from a token-envelope violation.
export const KINETIC_CAPACITY_EXCEEDED = "KINETIC_CAPACITY_EXCEEDED";

// Emitted only when supervision === "silent_veto" (A > E). The agent gets
// a plain deny with no appeal. The code rides on the receipt and the
// operator view, not back to the agent.
```

## Evidence receipt

Shape is validated. The A/E numbers get recorded, not checked against a formula.

```ts
export interface KineticReceipt {
  requestId: string;
  autonomyDemand: number;
  environmentalCapacity: number;
  margin: number;
  capacityKnown: boolean;
  supervision: SupervisionLevel;
  finalTier: ApprovalTier;
  deautomated: boolean;  // supervision raised above stable, not vetoed
  vetoed: boolean;       // supervision === "silent_veto"
  policyCode?: string;   // "KINETIC_CAPACITY_EXCEEDED" when vetoed
  rationale: string[];
}
```

## ROS2 reference profile v0.1

Illustrative and non-normative. It exists so both sides run the same numbers and the vectors reproduce. A production A/E provider (for example KTP's) is a drop-in that keeps these decisions and tightens at least as hard; its formula stays out of the conformance surface.

```ts
export const ROS2_REFERENCE_V0_1 = {
  vMaxMps: 1.5,
  fMaxN: 150,
  tauMaxNm: 40,
  omegaMaxRps: 2.0,
  eBase: 1.0,
  dSafeM: 1.0,
  mAllow: 0.5,  // margin >= mAllow -> stable / allow
  mVeto: 0.0,   // margin <= mVeto  -> silent_veto / deny
  // supervision sub-bands inside (mVeto, mAllow), by falling margin:
  metacognitiveFloor: 0.33, // [0.33, 0.50) -> metacognitive
  assistedFloor: 0.15,      // [0.15, 0.33) -> assisted
  // (0.00, 0.15) -> regulated
};

// A = max(v/vMax, F/fMax, tau/tauMax, |aAng|/omegaMax)
// E = eBase * proximity * human * novelty
//   proximity = clamp(nearestObstacleMeters / dSafe, 0, 1)
//   human     = humanDetected ? 0.5 : 1
//   novelty   = trajectoryNovel ? 0.6 : 1   (and capacityKnown = false)
// margin = 1 - A/E
// capacityKnown === false clamps supervision to at least "assisted".
```

## Conformance

Vectors live in [`conformance/ros2-reference-v0.1.json`](conformance/ros2-reference-v0.1.json). Six cases: a safe move, a self-check escalation, two capacity-driven escalations (human present, close obstacle), and two physics vetoes (force and torque over limit).

Normative fields per vector: `marginBand`, `supervision`, `decision`, `policyCode` (on a veto), and `tightenedAtMost`, a ceiling the result must not exceed. `referenceMargin` is informative, computed from the profile above. A richer A/E provider passes as long as it matches `decision` and `supervision`, emits the right `policyCode` on a veto, and tightens at least as hard.

A harness feeds each `request` to the registered provider and checks four things against `expect`: `decision` matches, `supervision` matches, `policyCode` matches on a veto, and every field in the result's `tightenedConstraints` sits at or below `tightenedAtMost`.

## Scope and next steps

1. This slice: types, receipt shape, reference profile, six vectors, deny code. No gateway change.
2. Place the types where they fit the tree, add the receipt shape validator.
3. Add a conformance runner over the JSON above.
4. Wire `supervision` into `assignTier` as a floor, behind the opt-in plugin, once the vectors pass.
