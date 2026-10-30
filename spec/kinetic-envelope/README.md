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

## Software/MCP reference profile v0.1

Illustrative and non-normative, like the ROS2 profile. It's the second reference profile, for the surface the MCP bridge serves: a software agent calling tools, where no kinematic quantity exists.

**`resource`, `action` and `params` are shaped the way the MCP bridge builds them.** `resource` is `mcp://{server}/{tool}`, `action` is what the bridge maps the tool to (`"call"` for nearly all tools), and the tool's arguments are in `params`. `executionContext` is what a deployment would supply; the interceptor sets none today (S8). Every vector's `request` is a valid `sintRequestSchema` instance, and the runner checks that. `physicalContext` is not used. `"production"` and `"staging"` are the vectors' own `deploymentProfile` labels, which the field allows.

**Magnitudes are derived, not declared.** The provider reads:

- the **tool name** from `resource`, for irreversibility;
- **allowlisted target arguments** in `params` (non-empty strings only), with `resource`, for what the call touches;
- **`executionContext`** (`humanAuthority`, `deploymentProfile`, `siteId`, `executor`) and whether `recentActions` is empty, for capacity.

No other `params` key is read. A caller-written `riskScore`, `margin` or `humanApproved` is data about the call, not evidence (vector S9).

```ts
// Identical to PROFILE in software-agent-envelope-conformance.test.ts.
export const SOFTWARE_AGENT_REFERENCE_V0_1 = {
  // A = max(demand_i / ceiling_i)
  ceilings: {
    privilege: 0.5,
    reachability: 0.8,
    irreversibility: 0.7,
    credentialReach: 0.4,
    configurationReach: 0.5,
  },
  // irreversibility from the tool name, matched as WHOLE tokens; first match wins.
  // The name is normalized first: camelCase split, "-" "." → "_", lowercased
  // ("readFile" → "read_file"), so "eval" does not match inside "retrieval_search".
  toolVerbs: [
    { match: /(^|_)(exec|execute|shell|bash|run_command|command|eval|subprocess|powershell|cmd|sh|system)(_|$)/, irreversibility: 1.0 },
    { match: /(^|_)(delete|remove|unlink|purge|drop|truncate|destroy|wipe)(_|$)/, irreversibility: 1.0 },
    { match: /(^|_)(rename|move)(_|$)/, irreversibility: 0.55 },
    { match: /(^|_)(write|create|insert|update|put|set|append|patch|upload|send|post|publish|register|transfer|trade)(_|$)/, irreversibility: 0.4 },
    { match: /(^|_)(read|get|list|query|search|fetch|describe|info|stat|stats|check|discover|balance|history)(_|$)/, irreversibility: 0.0 },
  ],
  unknownToolIrreversibility: 0.5, // a mutation: not harmless, not destruction
  // what the call touches: these params keys, non-empty string values only.
  // A listed key present with any other value → credentialReach and
  // configurationReach at their ceilings.
  argumentTargets: ["path", "file", "filePath", "filename", "source", "destination", "target", "uri", "url", "directory", "dir"],
  // credentialReach / configurationReach: matched over resource and targets
  targetPatterns: [
    { match: /(^|\/)\.(aws|ssh|gnupg)\//i, credentialReach: 1.0 },
    { match: /(secret|credential|token|apikey|api_key|keychain)/i, credentialReach: 1.0 },
    { match: /(^|\/)(etc|LaunchAgents|LaunchDaemons|systemd)\//i, configurationReach: 0.8 },
    { match: /(^|\/)\.(claude|cursor|config)\//i, configurationReach: 0.9 },
    { match: /(^|\/)(CLAUDE|AGENTS)\.md$/i, configurationReach: 0.9 },
  ],
  // reachability: a URL among the targets wins (loopback host → 0.2, else by
  // scheme, unknown scheme → the ceiling); otherwise by server; otherwise 0.4.
  // A READ over a URL takes the scheme value × 0.75: it extends only its own
  // request, not a payload. A public-URL read escalates; a write still vetoes.
  reachabilityByScheme: { file: 0.1, ipc: 0.2, mcp: 0.4, ros2: 0.5, http: 0.8, https: 0.8 },
  urlReadReachabilityFactor: 0.75,
  mcpDefaultReachability: 0.4, // unknown server, no URL argument
  loopbackHost: /^(127\.|localhost(:|$)|\[?::1\]?(:|$))/,
  loopbackReachability: 0.2,
  serverReachability: {
    filesystem: 0.1, database: 0.2, memory: 0.1,
    github: 0.6, slack: 0.6, email: 0.6, browser: 0.6, fetch: 0.6,
  },
  // privilege: resolved by the provider from the token named by tokenId
  // (vectors declare it as tokenFacts.heldPrivilege; it is not in the request)

  // E = eBase * product(factors)
  capacity: {
    eBase: 1.0,
    humanAuthorityMissing: 0.75,        // no humanAuthority, or level not accepted
    humanAuthorityStaleOrRevoked: 0.5,  // revokedAt set, observedAt missing, or older than maxProofAgeMs
    productionSite: 0.6,                // deploymentProfile "production", or siteId matching /prod/i
    novelExecutor: 0.6,                 // executor.runtimeId present, recentActions empty
  },
  humanAuthority: { maxProofAgeMs: 900_000, accepted: ["delegation", "contextual_binding"] },
  // same bands as ROS2
  mAllow: 0.5,
  metacognitiveFloor: 0.33,
  assistedFloor: 0.15,
};

// capacityKnown = false when executor.runtimeId is absent, when it is present
// with no recentActions, or when an unrevoked humanAuthority has no observedAt.
// As in ROS2, capacityKnown === false clamps supervision to at least "assisted".
```

**Tightening.** None. No `TightenedConstraints` field expresses a software restriction, so `tightenedAtMost` is empty in every vector. The profile governs through `supervision` alone.

**Named for v0.2.** Two choices in this profile are deliberately coarse. A delete of anything vetoes, because `irreversibility` 1.0 exceeds its 0.7 ceiling even in a scratch directory; the profile cannot tell a temp file from a database. And there is no cost dimension, so a tool such as `domain_register` reads as a write (escalates to `assisted`) where the MCP bridge's own classification puts it at T3. Both over-escalate to a human rather than under-supervise, so they ship as named gaps.

## Conformance

Vectors live in [`conformance/ros2-reference-v0.1.json`](conformance/ros2-reference-v0.1.json). Seven cases: a safe move, a self-check escalation, two capacity-driven escalations (human present, close obstacle), two physics vetoes (force and torque over limit), and an unknown-capacity clamp (a safe-looking margin forced to `assisted` because the trajectory is novel).

Normative fields per vector: `marginBand`, `supervision`, `decision`, `policyCode` (on a veto), and `tightenedAtMost`, a ceiling the result must not exceed. `referenceMargin` is informative, computed from the profile above. A richer A/E provider passes as long as it matches `decision` and `supervision`, emits the right `policyCode` on a veto, and tightens at least as hard.

A harness feeds each `request` to the registered provider and checks four things against `expect`: `decision` matches, `supervision` matches, `policyCode` matches on a veto, and every field in the result's `tightenedConstraints` sits at or below `tightenedAtMost`.

Software/MCP vectors live in [`conformance/software-agent-reference-v0.1.json`](conformance/software-agent-reference-v0.1.json). Nine cases:

- a safe read;
- a self-check escalation (a write);
- two capacity-driven escalations: no human authority proof, and a production site (the latter reaches `regulated`);
- three vetoes: credential reach, where the target exists only in the arguments; configuration reach, a write to agent settings; and arbitrary shell execution;
- an unknown-capacity clamp: a read with no `executionContext`, which is how the MCP interceptor sends requests today;
- an argument-claims case: S2 with score-shaped keys added to `params`, which must not change the result.

Same normative fields as ROS2. The runner additionally parses every vector's `request` with `sintRequestSchema`.

## Scope and next steps

1. This slice: types, receipt shape, reference profile, six vectors, deny code. No gateway change.
2. Place the types where they fit the tree, add the receipt shape validator.
3. Add a conformance runner over the JSON above.
4. Wire `supervision` into `assignTier` as a floor, behind the opt-in plugin, once the vectors pass.
