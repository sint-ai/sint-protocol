# Embodied authorization: whitepaper execution roadmap

**Baseline:** `8ba9660` (24 October 2026). The external repository audit examined
`915b4d7`. This handoff was updated on 28 October 2026 with the implementation
through `ffd9207` in PR #271; check `main` for subsequent changes. The checkout
contains the predictive execution broker, signed simulation evidence policy,
world snapshot adapter, and simulation server.
Treat the whitepaper as the target design and the audit as findings to verify
against each subsequent commit, not as instructions to execute verbatim.

The [Sereact comparison and SINT upgrade proposal](../research/sereact-sint-assessment-2026.md)
adds a concrete VLA planning, recovery, and learning-loop research lane.
The [live scene command-validation comparison](../research/live-scene-command-validation-2026.md)
maps MoveIt, Autoware, Nav2, Isaac Sim, Waymo, Realtime Robotics, and Siemens
to a scan-test-authorize-dispatch implementation plan. It also separates
human demonstrations, human-near-robot motion, and synthetic counterfactual
episodes into offline calibration and online per-command checks.

## Product direction: synthetic probabilistic environment

**Intent:** Before any bounded physical command reaches a robot, SINT evaluates
its exact proposed effect against a fresh synthetic representation of the
current environment and several plausible variations. This applies to VLA,
planner, teleoperator, fleet, MCP, and direct API command sources. A retry,
regrasp, changed target, or new action chunk is a new command. Emergency stop
remains unconditional and must not wait for simulation or authorization.

The synthetic environment combines an observed scene snapshot with uncertainty
over object pose, friction/contact, payload, sensor error, human proximity,
controller delay, and other site-specific variables. A learned world model may
propose likely or adversarial futures and prioritize cases. A physics,
kinematics, collision, or deterministic envelope checker evaluates the concrete
command in those cases. Learned probabilities help choose more tests and can
trigger denial or escalation; they never certify a dangerous command as safe.

```text
physical command source
  → exact effect plan + token + fresh scene snapshot
  → scenario generator (measured uncertainty + adversarial cases)
  → deterministic checks over each sampled scene and hard envelope
  → signed simulation receipt: pass / fail / indeterminate + coverage
  → PolicyGateway.intercept() + any required human approval
  → execution broker rechecks scene and consumes one-use nonce
  → local controller shield → actuator → signed outcome and drift record
```

"Every command" means every independently dispatchable physical effect or
bounded VLA action chunk. Re-simulating every servo tick would miss real-time
deadlines; the independent local controller shield constrains each control
update inside the permitted envelope. A precomputed trajectory permit must be
short-lived, bounded in time and space, and invalidated when its scene or
preconditions change. No operator or bridge has a direct actuator path around
the gate. The actual robot command-gate and controller integration remain
unproven until a live ROS graph and hardware pilot establish this property.

### Simulation contract and acceptance rule

| Contract item | Required evidence | Failure behavior |
|---|---|---|
| Exact effect | Digest of request, action, parameters, token, robot/tool/payload, task phase, and action-chunk horizon | Any substitution requires a new simulation and authorization. |
| Fresh world | Sensor provenance, observed time, state epoch, uncertainty bounds, human and obstacle state, policy and calibration digests | Missing, stale, conflicting, or changed state blocks dispatch. |
| Scenario set | Reproducible seeds, perturbation distribution and bounds, adversarial cases, run count, coverage, simulator/model versions and assumptions | Insufficient required coverage is indeterminate. |
| Hard checks | Collision, geofence, clearance, speed, force, torque, interlock and other token/site limits in each relevant scenario | One hard violation is fail, regardless of average score. |
| Probabilistic estimate | Risk estimate with denominator, calibration set/version, uncertainty interval, and known unsupported phenomena | Uncalibrated or out-of-distribution estimates cannot lower the tier or override hard checks. |
| Receipt | Signed result bound to the exact effect, snapshot, scenario set, simulator identity, expiry, and one-use nonce | Invalid, absent, failed, indeterminate, expired, or replayed receipt never authorizes dispatch. |
| Dispatch | Re-read current world and compare digest/epoch and preconditions immediately before movement | Drift, timeout, or verifier/storage failure denies or safe-holds; retry starts a new cycle. |

The production default for T2/T3 physical effects is **simulation required**.
Any request that can actuate hardware but is classified T0/T1 is a tiering
error and must be denied before dispatch. The gate may permit a narrower
site-validated deterministic check for a known
low-consequence effect, but any exception must be explicit, versioned, and
audited. Simulation estimates residual risk; neither finite sampling nor a
"pass" receipt proves zero physical risk. Keep the controller's independent
hard limits and unconditional E-stop below this pipeline.

### Build sequence for this direction

The first software slice now uses a short, collinear ROS 2 waypoint path, a stored
odometry/map/obstacle scene, and an opt-in checker for static, moving, and human
obstacle clearance with explicit position and moving-object speed uncertainty.
It checks a conservative full-speed stopping corridor using configured braking
and reaction-time bounds. The default bounded
motion model still checks declared effect parameters. Default deterministic
receipts report zero sampled-scenario coverage. An opt-in fixed-case navigation
runner now checks bounded adversarial footprint, reaction-delay, and
human-speed stresses against the same live scene and reports conclusive
fixed-case coverage. It does not estimate probability or replace physics.
Before a robot pilot,
extend the scene checker to controller-validated braking profiles, time to
contact, geofence, and controller dynamics; then add a richer physics adapter.
Maintain separate consequence tier and scene-derived hazard findings, with
stale or unsupported state yielding `indeterminate` and blocking dispatch.

1. **Close the software boundary.** Require a V2 signed receipt for every
   physical T2/T3 dispatch in production, including direct routes and VLA
   chunks. Verify no alternate bridge or replay path reaches the adapter.
2. **Define the synthetic scene.** Extend `SimulationWorldSnapshot` with
   versioned sensor provenance, uncertainty distributions/bounds, task phase,
   and robot/tool/payload state. Preserve a digest of exact inputs and reject
   stale or internally inconsistent scenes. The ROS 2 adapter now puts task
   phase, tool, payload geometry, and calibration and policy digests in the
   canonical payload addressed by `SimulationWorldSnapshot.digest`. A payload
   digest that is not 64 hex characters is rejected, and swapping that payload
   changes the digest. A task tool identity that is only whitespace is rejected as `INVALID_WORLD_STATE`. A task tool identity with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. A task phase that is only whitespace is rejected as `INVALID_WORLD_STATE`. A task phase with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. A task payload identity that is only whitespace is rejected as `INVALID_WORLD_STATE`. A task payload identity with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. Sensor provenance is versioned on that ROS 2 canonical
   payload; a missing or whitespace-only sensor identity, a sensor identity with leading or trailing whitespace, a missing or whitespace-only sensor version, a sensor version with leading or trailing whitespace, or a source that is not a world-state
   channel is rejected. A sensor that names a world-state source the snapshot
   does not contain is rejected as `INVALID_WORLD_STATE`. Occupancy and occlusion are versioned on that ROS 2
   canonical payload (schema 1.0.0); a missing or invalid occlusion state is
   rejected. An occupancy region with a missing or whitespace-only region id is rejected as
   `INVALID_WORLD_STATE`. An occupancy region id with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. An occupancy flag that is not a boolean is rejected
   as `INVALID_WORLD_STATE`. Duplicate occupancy region ids on that snapshot are rejected as
   `INVALID_WORLD_STATE`. Occupancy regions are sorted by region id before
   hashing, so reordering the same regions does not change the snapshot digest
   or the scene-contract digest. Sensor provenance entries are sorted by sensor
   id before hashing, so reordering the same sensors does not change those
   digests either. A declared odometry, map, or obstacle frame that disagrees with
   the snapshot frame is rejected as `INVALID_WORLD_STATE`. An odometry frame that is only whitespace is rejected as `INVALID_WORLD_STATE`. An obstacle frame that is only whitespace is rejected as `INVALID_WORLD_STATE`. An obstacle identity that is only whitespace is rejected as `INVALID_WORLD_STATE`. An obstacle identity with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. Obstacle identities that collide after trimming are rejected as `INVALID_WORLD_STATE`. A robot identity that is only whitespace is rejected as `INVALID_WORLD_STATE`. A robot identity with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. An empty robot identity is rejected as `INVALID_WORLD_STATE`. A snapshot frame that is only whitespace is rejected as `INVALID_WORLD_STATE`. A snapshot frame with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. A safety-controller identity that is only whitespace is rejected as `INVALID_WORLD_STATE`. A safety-controller identity with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. A joint name that is only whitespace is rejected as `INVALID_WORLD_STATE`. A joint name with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. Joint names that collide after trimming are rejected as `INVALID_WORLD_STATE`. A map frame that is only whitespace is rejected as `INVALID_WORLD_STATE`. A transform parent frame that is only whitespace is rejected as `INVALID_WORLD_STATE`. A transform child frame that is only whitespace is rejected as `INVALID_WORLD_STATE`. Transform child frames that collide after trimming are rejected as `INVALID_WORLD_STATE`. Duplicate sensor
   ids on that snapshot are rejected as `INVALID_WORLD_STATE`. Source clocks
   that disagree by more than `maxClockSkewMs` are rejected as
   `INVALID_WORLD_STATE`. A `stateEpoch` whose text before the first `:` names
   a different robot than `robotId` is rejected as `INVALID_WORLD_STATE`.
   A `stateEpoch` that does not name `robotId` is rejected as
   `INVALID_WORLD_STATE`. A `stateEpoch` of `robotId:` with an empty counter
   is rejected as `INVALID_WORLD_STATE`. A `stateEpoch` whose counter is not
   a canonical integer is rejected as `INVALID_WORLD_STATE`.
   The shared snapshot type does not grow new fields
   for these scene facts.
3. **Add scenario generation.** Scene-aware navigation accepts an approved
   fixed-case policy plus a seeded perturbation distribution. Each unique seed
   draws one deterministic sample inside the approved radius, reaction-time,
   and human-speed bounds. The signed receipt stores those seeds. Coverage is
   the fraction of conclusive runs, not a collision probability. Bounded motion
   accepts the same shape for extra force, extra velocity, and reduced
   clearance: unique seeds, one deterministic sample per seed, and those seeds
   on the signed receipt. A duplicate seed is rejected before issuance. Field
   calibration, and distributions beyond navigation and bounded motion, remain
   open. A model-generated "safe" label is not a policy decision.
4. **Add a physical simulator adapter.** A software-only adapter records pass,
   fail, and indeterminate from the deterministic bounded-motion worker. The
   receipt backend stays `sint-deterministic` and the evidence grade stays
   `deterministic`. The record does not claim Gazebo ran. Unsupported
   phenomena, latency, and a measured Gazebo/MoveIt backend remain open.
5. **Calibrate and compare.** Capture signed device outcomes and near misses,
   compare predicted with observed contact, clearance and task outcome, and
   measure risk calibration by site and effect class. Replay held-out human
   demonstrations and interventions without treating an unexecuted
   counterfactual as an observed outcome. Tighten or disable a
   simulator whose field drift exceeds its approved bound.
6. **Prove the physical boundary.** In a ROS 2 Enforce graph and low-energy
   cell, show that direct topic/action bypass, stale scene, swapped payload,
   human entry, model update, simulator outage, and uplink loss cannot cause
   unapproved motion. Measure authorization and simulation p50/p95/p99 latency
   separately from controller-loop latency and report false denials.

## Release gates

| Order | Deliverable | Exit evidence | Status at this branch |
|---|---|---|---|
| 0A | Trusted root issuers and verifiable delegated lineage | Unknown issuer, missing parent, scope expansion, expired or revoked ancestor deny at `intercept()` and preflight | Implemented for configured gateways; production server now requires `SINT_TRUSTED_ISSUERS`. Library consumers must opt in pending the next breaking release. |
| 0B | Close MCP self-approval and process-spawn path | Agent cannot call approval, token minting, delegation or server-management tools; all built-ins traverse `intercept()` | Implemented in proxy with per-server tokens. Production dashboard votes now require allowlisted operator signatures. |
| 0C | Proxy transport and credential isolation | Downstream receives only explicitly selected environment; HTTP Origin/Host and gateway CORS are deployment restricted; unsupported network transports reject private targets | Environment isolation and loopback HTTP/production CORS controls implemented. Remote downstream transport remains unsupported. |
| 0D | Evidence durability | Database refuses UPDATE, DELETE and TRUNCATE; signed proof served over HTTP; retention and authority export documented and enforced | Database guard and signed HTTP proof implemented; retention and authority export pending. |
| 1 | Simulation-before-dispatch for every physical effect | Every T2/T3 physical command and bounded VLA chunk has an exact, fresh, signed pass receipt; failed/indeterminate/absent evidence cannot dispatch | Production gateway requires trusted simulator signers and signed V2 receipts for T2/T3. Known physical transport commands now have a T2 floor even if a site rule labels them T0/T1; explicit read and staging actions retain lower tiers. An opt-in scene-aware navigation model checks a bounded collinear waypoint path and conservative stop corridor against stored ROS 2 scene geometry, including measured position and moving-object speed-error bounds. Turns and reversals return indeterminate. Production workers reject the default parameter-only ROS 2 model. An optional fixed adversarial case policy runs bounded footprint, reaction, and human-speed stresses; its signed receipt identifies the exact policy and conclusive case coverage. A shared dispatch inventory now classifies known physical transports, explicit staging, VLA action chunks, Home Assistant actuators, direct HTTP actuator routes, and named MCP robot tools. `assignTier()` floors every actuating class at T2, so a site rule cannot leave those commands at observe or prepare. Edge replay is still covered by the broker nonce store rather than this inventory. An approved navigation policy may add a seeded perturbation distribution: unique seeds, bounded radius, reaction-time, and human-speed support, one deterministic sample per seed, and those seeds on the signed receipt. Coverage remains the fraction of conclusive runs, not a collision probability. Bounded motion now accepts the same seeded distribution for extra force, extra velocity, and reduced clearance: unique seeds, one deterministic sample per seed, and those seeds on the signed receipt. A duplicate seed is rejected before issuance. A software-only adapter records pass, fail, and indeterminate from the deterministic worker. The receipt backend stays sint-deterministic and the evidence grade stays deterministic. It does not claim Gazebo ran. Field calibration, distributions beyond navigation and bounded motion, a measured Gazebo/MoveIt backend, and a same-graph bypass proof remain pending. |
| 2 | Scene-bound permits and edge continuity | Scene, robot, payload, policy and simulator digests bound; state change invalidates permit; nonce survives restart; offline runner holds a safe state | Snapshot binding exists in predictive path; the broker now re-reads scene digest and epoch after nonce consumption and rejects drift before adapter dispatch. File-backed edge nonce consumption survives restart when configured. The ROS 2 canonical snapshot can include task phase, tool, payload geometry, and calibration and policy digests; a non-hash payload digest is rejected, and a swapped payload changes the snapshot digest. A task tool identity that is only whitespace is rejected as `INVALID_WORLD_STATE`. A task tool identity with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. A task phase that is only whitespace is rejected as `INVALID_WORLD_STATE`. A task phase with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. A task payload identity that is only whitespace is rejected as `INVALID_WORLD_STATE`. A task payload identity with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. Sensor provenance is versioned on that canonical payload (schema 1.0.0); a missing or whitespace-only sensor identity, a sensor identity with leading or trailing whitespace, a missing or whitespace-only sensor version, a sensor version with leading or trailing whitespace, or a source that is not a world-state channel is rejected. A sensor that names a world-state source the snapshot does not contain is rejected as `INVALID_WORLD_STATE`. Occupancy and occlusion are versioned on that canonical payload (schema 1.0.0); a missing or invalid occlusion state is rejected. An occupancy region with a missing or whitespace-only region id is rejected as `INVALID_WORLD_STATE`. An occupancy region id with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. An occupancy flag that is not a boolean is rejected as `INVALID_WORLD_STATE`. Duplicate occupancy region ids on that snapshot are rejected as `INVALID_WORLD_STATE`. Occupancy region ids that collide after trimming are rejected as `INVALID_WORLD_STATE`. A declared odometry, map, or obstacle frame that disagrees with the snapshot frame is rejected as `INVALID_WORLD_STATE`. An odometry frame that is only whitespace is rejected as `INVALID_WORLD_STATE`. An obstacle frame that is only whitespace is rejected as `INVALID_WORLD_STATE`. An obstacle identity that is only whitespace is rejected as `INVALID_WORLD_STATE`. An obstacle identity with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. Obstacle identities that collide after trimming are rejected as `INVALID_WORLD_STATE`. A robot identity that is only whitespace is rejected as `INVALID_WORLD_STATE`. A robot identity with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. An empty robot identity is rejected as `INVALID_WORLD_STATE`. A snapshot frame that is only whitespace is rejected as `INVALID_WORLD_STATE`. A snapshot frame with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. A safety-controller identity that is only whitespace is rejected as `INVALID_WORLD_STATE`. A safety-controller identity with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. A joint name that is only whitespace is rejected as `INVALID_WORLD_STATE`. A joint name with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. Joint names that collide after trimming are rejected as `INVALID_WORLD_STATE`. A map frame that is only whitespace is rejected as `INVALID_WORLD_STATE`. A transform parent frame that is only whitespace is rejected as `INVALID_WORLD_STATE`. A transform child frame that is only whitespace is rejected as `INVALID_WORLD_STATE`. Transform child frames that collide after trimming are rejected as `INVALID_WORLD_STATE`. Duplicate sensor ids on that snapshot are rejected as `INVALID_WORLD_STATE`. Sensor identities that collide after trimming are rejected as `INVALID_WORLD_STATE`. Source clocks that disagree by more than `maxClockSkewMs` are rejected as `INVALID_WORLD_STATE`. A `stateEpoch` whose text before the first `:` names a different robot than `robotId` is rejected as `INVALID_WORLD_STATE`. A `stateEpoch` that does not name `robotId` is rejected as `INVALID_WORLD_STATE`. A `stateEpoch` of `robotId:` with an empty counter is rejected as `INVALID_WORLD_STATE`. A `stateEpoch` whose counter is not a canonical integer is rejected as `INVALID_WORLD_STATE`. When task, sensor provenance, or occupancy is present, the snapshot carries a `sceneContractDigest` over those versioned fields, and changing one of them changes that digest. The broker permit rejects dispatch when the live world's `sceneContractDigest` differs from the receipt, including a change during nonce consumption. A capability token may carry that digest; the advisory effect plan copies it, and the gateway rejects a receipt whose snapshot digest differs (`SIMULATION_CONTEXT_MISMATCH`). The effect-plan hash covers resource, action, params, and the scene-contract digest when one is bound. Delegation that supplies tightened constraints keeps the parent's scene-contract digest. Atomic controller-side scene locking and controller hold remain pending. |
| 3 | Robot enforcement pilot | SROS2 Enforce mode plus a command-gate node owns action endpoints; direct actuator bypass fails in an actual ROS graph | Docker demonstration exists; product binding pending. |
| 4 | Continuous safety shield | Controller-rate barrier/QP filter and tested safe-hold behavior, independent of uplink and gateway availability | Research and hardware integration pending. |
| 5 | Third-party evidence | COSE/SCITT receipts, signed ledger heads, inclusion proof export, field drift measurements | Pending. |

## Audit requirement coverage

| Whitepaper requirement | Current evidence | Remaining acceptance test |
|---|---|---|
| R1 Non-bypassable enforcement | MCP built-ins now use the gate; operator-only calls deny; SROS2 Enforce demo exists | A production ROS 2 command-gate node owns `send_goal`, `cancel_goal`, and motion writes; a same-graph bypass attempt fails. |
| R2 Agent and robot identity | Ed25519 agent signatures and platform-signed mission outcomes. The gateway now ignores caller-supplied attestation grades and accepts attestation-bound tokens only through a configured trusted resolver; absent or rejected evidence denies. | Implement and validate a nonce-bound device quote verifier against a trusted hardware root, bind it to the robot and exact request, and configure the resolver in deployment. |
| R3 Delegator lineage | Configured gateways verify root, each parent, attenuation, expiry, and ancestor revocation; edge runner denies without a local capability issuer anchor | Make trusted roots mandatory for all gateway library deployments; persist and test cascade revocation across nodes. |
| R4 Least privilege | Tool action scopes, force, velocity, geofence, corridor, localization checks | Bind payload, tool, cell, and robot identity to token and execution receipt; reject substitutions. |
| R5 Context freshness | Hardware and localization age gates; predictive snapshot path; broker rechecks digest, epoch, and expiry after nonce consumption | Bind and revalidate sensor preconditions, task phase, simulator calibration, and policy version at the controller boundary. |
| R6 Human approval | Production votes are signed by allowlisted non-agent keys and recorded individually | Add dashboard key custody, approval-to-plan digest binding, and a documented K-of-N signature profile. FROST remains research. |
| R7 Local autonomy | Offline edge dispatch verifier and optional file-backed replay store, tested across restart and concurrent runners | Require durable replay storage in deployment and drive a controller-specific safe hold on uplink loss or approval timeout. |
| R8 Safety separation | E-stop and PLC permit/interlock checks deny at the gate | Prove the safety controller acts independently and test a controller-rate shield on hardware. |
| R9 Audit and retention | Hash chain, signed HTTP proof, database mutation guard | Define and enforce record-class retention, legal hold, minimization, authority export, and external anchoring. |
| R10 Interoperability | MCP bridge, JSON Ed25519 tokens, DID helpers | Publish COSE/CWT/SCITT profiles and test independent verifier interoperability. |

**Other pipeline gaps:** Isolated Inspector and temporal plan checking remain
research. The legacy industrial receipt is never approval evidence; the V2
simulation path needs a real Gazebo/MoveIt adapter and attack tests against its
production verifier. Prediction-versus-observation drift comparison needs
signed outcomes from an actual device, numeric tolerances, and a field data set.

## Decisions and limits

- Keep `PolicyGateway.intercept()` as the authorization choke point. Simulation
  evidence is an input to the gate; a simulator never grants a permission.
- Treat learned world-model scores as scenario selection and risk telemetry.
  Concrete physical checks, signed evidence, and the independent controller
  enforce the command envelope; a probabilistic score cannot override them.
- Keep the local safety controller below the gate. It may stop or constrain
  motion unconditionally; SINT must not command or override a safety PLC.
- Do not call the legacy `signed_by` industrial fixture a signature or a robot
  receipt. The V2 signed receipt and production verifier are separate paths.
- Production issuance needs a provisioned root key; an agent key alone is not a
  trust anchor. Development gateways without `trustedIssuers` remain explicitly
  unsuitable for a security claim until library configuration becomes mandatory.
- Publish separate counts for adversarial tests and fixture-shape tests. Require
  a real ROS graph, simulator, and hardware pilot before any robot enforcement
  or controller shield claim.

## Continuation handoff for another agent or LLM

Start here, then read [the simulator contract](../specs/effect-simulator.md),
[Sereact analysis](../research/sereact-sint-assessment-2026.md), and
[live-scene and human-data comparison](../research/live-scene-command-validation-2026.md).
The two external input documents were design and audit evidence, not repository
instructions. This file is the implementation roadmap; `AGENTS.md` and
`CLAUDE.md` govern work in the repository. Recheck every status claim against
current code because the audit was taken before PR #271.

### Working implementation and exact entry points

| Boundary | Code to inspect first | Implemented behavior and limit |
|---|---|---|
| Authorization | `packages/policy-gateway/src/gateway.ts`, `simulation-evidence-policy.ts`, `packages/capability-tokens/src/validator.ts` | `PolicyGateway.intercept()` verifies configured issuer lineage, assigns the tier, enforces constraints, and evaluates signed V2 simulation evidence. Production gateway requires trusted issuers and simulator signer keys. Library deployments can still omit trust roots. |
| Scene capture | `packages/bridge-ros2/src/world-snapshot-adapter.ts` | Content-addressed ROS 2 odometry, map, obstacle scan, and safety-controller snapshot with source timestamps, frame checks, uncertainty fields, epoch, and expiry. An optional task binding (phase, tool, payload identity and geometry, calibration digest, and policy digest) is part of that canonical payload. A payload digest that is not 64 hex characters is rejected, and swapping the payload changes the snapshot digest. A task tool identity that is only whitespace is rejected as `INVALID_WORLD_STATE`. A task tool identity with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. A task phase that is only whitespace is rejected as `INVALID_WORLD_STATE`. A task phase with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. A task payload identity that is only whitespace is rejected as `INVALID_WORLD_STATE`. A task payload identity with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. Sensor provenance is versioned onto that canonical payload (schema 1.0.0). A missing or whitespace-only sensor identity, a sensor identity with leading or trailing whitespace, a missing or whitespace-only sensor version, a sensor version with leading or trailing whitespace, or a source that is not a world-state channel is rejected. A sensor that names a world-state source the snapshot does not contain is rejected as `INVALID_WORLD_STATE`. Occupancy and occlusion are versioned onto that canonical payload (schema 1.0.0). A missing or invalid occlusion state is rejected. An occupancy region with a missing or whitespace-only region id is rejected as `INVALID_WORLD_STATE`. An occupancy region id with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. An occupancy flag that is not a boolean is rejected as `INVALID_WORLD_STATE`. Duplicate occupancy region ids on that snapshot are rejected as `INVALID_WORLD_STATE`. Occupancy region ids that collide after trimming are rejected as `INVALID_WORLD_STATE`. A declared odometry, map, or obstacle frame that disagrees with the snapshot frame is rejected as `INVALID_WORLD_STATE`. An odometry frame that is only whitespace is rejected as `INVALID_WORLD_STATE`. An obstacle frame that is only whitespace is rejected as `INVALID_WORLD_STATE`. An obstacle identity that is only whitespace is rejected as `INVALID_WORLD_STATE`. An obstacle identity with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. Obstacle identities that collide after trimming are rejected as `INVALID_WORLD_STATE`. A robot identity that is only whitespace is rejected as `INVALID_WORLD_STATE`. A robot identity with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. An empty robot identity is rejected as `INVALID_WORLD_STATE`. A snapshot frame that is only whitespace is rejected as `INVALID_WORLD_STATE`. A snapshot frame with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. A safety-controller identity that is only whitespace is rejected as `INVALID_WORLD_STATE`. A safety-controller identity with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. A joint name that is only whitespace is rejected as `INVALID_WORLD_STATE`. A joint name with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. Joint names that collide after trimming are rejected as `INVALID_WORLD_STATE`. A map frame that is only whitespace is rejected as `INVALID_WORLD_STATE`. A transform parent frame that is only whitespace is rejected as `INVALID_WORLD_STATE`. A transform child frame that is only whitespace is rejected as `INVALID_WORLD_STATE`. Transform child frames that collide after trimming are rejected as `INVALID_WORLD_STATE`. Duplicate sensor ids on that snapshot are rejected as `INVALID_WORLD_STATE`. Sensor identities that collide after trimming are rejected as `INVALID_WORLD_STATE`. Source clocks that disagree by more than `maxClockSkewMs` are rejected as `INVALID_WORLD_STATE`. A `stateEpoch` whose text before the first `:` names a different robot than `robotId` is rejected as `INVALID_WORLD_STATE`. A `stateEpoch` that does not name `robotId` is rejected as `INVALID_WORLD_STATE`. A `stateEpoch` of `robotId:` with an empty counter is rejected as `INVALID_WORLD_STATE`. A `stateEpoch` whose counter is not a canonical integer is rejected as `INVALID_WORLD_STATE`. When task, sensor provenance, or occupancy is present, the snapshot carries a `sceneContractDigest` over those versioned fields, and changing one of them changes that digest. The broker permit rejects dispatch when the live world's `sceneContractDigest` differs from the receipt, including a change during nonce consumption. A capability token may carry that digest. The advisory effect plan copies it, and the gateway rejects a receipt whose snapshot digest differs. The effect-plan hash covers resource, action, params, and the scene-contract digest when one is bound, and delegation that supplies tightened constraints keeps the parent's scene-contract digest. It is an adapter, not a live ROS node. |
| Effect checks | `packages/engine-effect-simulator/src/scene-aware-navigation-model.ts`, `fixed-case-navigation-model.ts`, `fixed-case-bounded-motion-model.ts`, `deterministic-effect-simulator.ts`, `software-only-simulator-adapter.ts` | Planar collinear waypoint and stopping-corridor checks; fixed footprint, reaction-delay, and human-speed stress cases are opt-in. Default receipt has one run and zero sampled coverage. An approved navigation policy may add unique seeds; each seed draws one deterministic perturbation inside the approved bounds, and the receipt stores that seed list. Bounded motion accepts the same seeded distribution for extra force, extra velocity, and reduced clearance: unique seeds, one deterministic sample per seed, and those seeds on the signed receipt. A duplicate seed is rejected before issuance. Coverage is the fraction of conclusive observed, fixed, and seeded runs, not a probability. A software-only adapter records pass, fail, and indeterminate from that deterministic worker. The recorded backend stays `sint-deterministic` and the evidence grade stays `deterministic`. It does not claim Gazebo ran. Turns, contact, and controller-rate dynamics remain unsupported. |
| Worker | `apps/simulation-server/src/config.ts`, `runtime.ts` | Production requires an explicit scene-aware model for known physical protocols, a persistent signer, and bearer authentication. The scenario policy is optional. Fixed cases plus seeds stay within 16 stress runs. It cannot claim physics-grade evidence. |
| Proof and dispatch | `packages/execution-broker/src/execution-broker.ts`, `packages/sint-edge-agent/src/runner.ts` | Broker checks exact receipt, scene digest, epoch, scene-contract digest, and expiry, consumes one-use nonce, and re-reads those fields immediately before adapter dispatch. Edge runner can use durable file-backed replay storage; controller-side atomic scene locking and actual safe hold remain unproven. |
| Operator and ledger | `apps/gateway-server/src/routes/approvals.ts`, `routes/ledger.ts`, `packages/evidence-ledger/` | Production REST votes require allowlisted signatures and are logged. HTTP ledger proof is signed; Postgres migrations guard UPDATE/DELETE/TRUNCATE. The dashboard does not yet hold operator signing keys. |

The conformance tests that exercise these paths are in
`packages/conformance-tests/src/simulation-evidence-conformance.test.ts`,
`physical-dispatch-conformance.test.ts`,
`scene-aware-navigation-conformance.test.ts`,
`seeded-navigation-distribution-conformance.test.ts`,
`deterministic-effect-simulator-conformance.test.ts`, and
`execution-broker-conformance.test.ts`. Unit tests also cover the gateway,
simulator, worker configuration, edge runner, approvals, and ledger. These tests
are software evidence; they do not prove actuator non-bypass on hardware.

### Ordered work with acceptance evidence

1. **Inventory and close all physical dispatch paths (P0).** Enumerate ROS 2,
   MAVLink, OPC-UA, MQTT/IoT, MCP robot tools, VLA chunks, direct HTTP routes,
   and edge replay. Normalize each effect to a bounded `EffectPlan` and deny
   any actuating command classified T0/T1. Add production-code conformance
   attempts that try to dispatch without a fresh, signed V2 receipt, through a
   lower-tier rule, with a reused nonce, or with a changed effect. Do not claim
   non-bypass until a same-graph robot attack fails.
2. **Make the live scene contract complete (P0).** The ROS 2 snapshot now
   stores task phase, tool, payload geometry, and calibration and policy
   digests in the canonical payload. A payload digest that is not 64 hex
   characters is rejected, and a swapped payload changes the snapshot digest.
   A task tool identity that is only whitespace is rejected as `INVALID_WORLD_STATE`. A task tool identity with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. A task phase that is only whitespace is rejected as `INVALID_WORLD_STATE`. A task phase with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. A task payload identity that is only whitespace is rejected as `INVALID_WORLD_STATE`. A task payload identity with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. Sensor provenance is versioned on that same payload; a missing or whitespace-only sensor
   identity, a sensor identity with leading or trailing whitespace, a missing or whitespace-only sensor version, a sensor version with leading or trailing whitespace, or a source that is not a world-state channel is rejected. A sensor that names a world-state source the snapshot does not contain is rejected as `INVALID_WORLD_STATE`.
   Occupancy and occlusion are versioned on that same payload; a missing or
   invalid occlusion state is rejected. An occupancy region with a missing or whitespace-only
   region id is rejected as `INVALID_WORLD_STATE`. An occupancy region id with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. An occupancy flag that is not a boolean is rejected as `INVALID_WORLD_STATE`. Duplicate occupancy region ids on that
   snapshot are rejected as `INVALID_WORLD_STATE`. Occupancy regions are sorted by
   region id before hashing, so reordering the same regions does not change the
   snapshot digest or the scene-contract digest. Sensor provenance entries are
   sorted by sensor id before hashing, so reordering the same sensors does not
   change those digests either. A declared odometry, map, or obstacle
   frame that disagrees with the snapshot frame is rejected as
   `INVALID_WORLD_STATE`. An odometry frame that is only whitespace is rejected as `INVALID_WORLD_STATE`. An obstacle frame that is only whitespace is rejected as `INVALID_WORLD_STATE`. An obstacle identity that is only whitespace is rejected as `INVALID_WORLD_STATE`. An obstacle identity with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. Obstacle identities that collide after trimming are rejected as `INVALID_WORLD_STATE`. A robot identity that is only whitespace is rejected as `INVALID_WORLD_STATE`. A robot identity with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. An empty robot identity is rejected as `INVALID_WORLD_STATE`. A snapshot frame that is only whitespace is rejected as `INVALID_WORLD_STATE`. A snapshot frame with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. A safety-controller identity that is only whitespace is rejected as `INVALID_WORLD_STATE`. A safety-controller identity with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. A joint name that is only whitespace is rejected as `INVALID_WORLD_STATE`. A joint name with leading or trailing whitespace is rejected as `INVALID_WORLD_STATE`. Joint names that collide after trimming are rejected as `INVALID_WORLD_STATE`. A map frame that is only whitespace is rejected as `INVALID_WORLD_STATE`. A transform parent frame that is only whitespace is rejected as `INVALID_WORLD_STATE`. A transform child frame that is only whitespace is rejected as `INVALID_WORLD_STATE`. Transform child frames that collide after trimming are rejected as `INVALID_WORLD_STATE`. Duplicate sensor ids on that snapshot are rejected
   as `INVALID_WORLD_STATE`. Sensor identities that collide after trimming are rejected as `INVALID_WORLD_STATE`. Source clocks that disagree by more than
   `maxClockSkewMs` are rejected as `INVALID_WORLD_STATE`. A `stateEpoch`
   whose text before the first `:` names a different robot than `robotId` is
   rejected as `INVALID_WORLD_STATE`. A `stateEpoch` that does not name
   `robotId` is rejected as `INVALID_WORLD_STATE`. A `stateEpoch` of
   `robotId:` with an empty counter is rejected as `INVALID_WORLD_STATE`. A `stateEpoch` whose counter is not a canonical integer is rejected as `INVALID_WORLD_STATE`.
   When task, sensor provenance, or occupancy is present, the snapshot carries
   a `sceneContractDigest` over those versioned fields, and changing one of
   them changes that digest.
   The broker permit rejects a mismatch between the live world and the receipt
   `sceneContractDigest`, including a change during nonce consumption. A
   capability token may carry that digest. The advisory effect plan copies it,
   and the gateway rejects a receipt whose snapshot digest differs. The
   effect-plan hash covers resource, action, params, and the scene-contract digest when one is bound. Delegation
   that supplies tightened constraints keeps the parent's scene-contract digest.
   Missing sources, stale state, and scene-contract drift after nonce
   consumption are already rejected. A `stateEpoch` that names a different
   robot than `robotId` is rejected. A `stateEpoch` that does not name the
   robot is rejected as `INVALID_WORLD_STATE`. A `stateEpoch` of `robotId:`
   with an empty counter is rejected as `INVALID_WORLD_STATE`. A `stateEpoch` whose counter is not a canonical integer is rejected as `INVALID_WORLD_STATE`. Duplicate occupancy region ids are rejected as `INVALID_WORLD_STATE`. Occupancy region ids that collide after trimming are rejected as `INVALID_WORLD_STATE`. Other identity
   substitutions remain open. Add
   controller-side atomic scene/permit enforcement; the broker's second read
   alone cannot eliminate a change between read and actuator use.
3. **Make scenario evidence reproducible and calibrated (P1).** Navigation
   now stores an approved seeded distribution: unique seeds, perturbation
   bounds, one deterministic sample per seed, and the seed list on the signed
   receipt. One hard failure still denies the aggregate, and a duplicate seed
   is rejected before issuance. Coverage is conclusive runs over the observed
   scene, fixed cases, and seeds. Bounded motion stores the same distribution
   for extra force, extra velocity, and reduced clearance: unique seeds, one
   deterministic sample per seed, and those seeds on the signed receipt. A
   duplicate seed is rejected before issuance. Field calibration, distributions
   beyond those two classes, forged high coverage, unsupported phenomena,
   timeout, and out-of-distribution scenes remain open. Do not interpret finite
   coverage as a collision probability.
4. **Add physical backends and independent controller protection (P1).** A
   software-only adapter records pass, fail, and indeterminate for a
   bounded-motion check. The receipt backend remains `sint-deterministic` and
   the evidence grade remains `deterministic`. It does not run Gazebo or
   MoveIt. Build a Gazebo/MoveIt or equivalent adapter with measured model
   fidelity and contact/dynamics checks, then a ROS 2 command-gate node in
   SROS2 Enforce
   mode that owns motion endpoints. Prove direct `/cmd_vel`/action bypass fails,
   and test a low-energy controller shield and unconditional E-stop under link
   loss and simulator outage. Record p50/p95/p99 scene assembly, simulation,
   policy, approval, and dispatch latency separately from controller latency.
5. **Govern human data and learned models (P1).** Replay demonstrations,
   interventions, near misses, and human-near-robot traces offline to construct
   hard cases and calibrate site-specific uncertainty. Keep generated
   counterfactual outcomes labeled as simulated. Add phase, familiarity,
   recovery-action, and model-version bindings before using a VLA proposal;
   learned scores may escalate or request more checks but cannot authorize.
   Record signed observed outcomes and compare prediction with measured
   clearance, contact, force, and task result; disable a drifting model.
6. **Finish trust, approvals, and evidence operations (P1/P2).** Implement a
   nonce-bound hardware quote verifier, mandatory roots for library gateways,
   durable edge replay deployment requirements, controller safe hold, and
   dashboard operator key custody. Define record-class retention, legal hold,
   minimization, external anchoring, and authority export without editing
   emitted ledger events. Publish third-party COSE/CWT/SCITT profiles only
   after independent verifier tests.

### Pilot gate and limits

Pilot one low-energy mobile robot or controlled pick-and-place cell with a
site-approved model and explicit operator ownership. The acceptance matrix must
include a person entering the zone, moving obstacle, stale or occluded sensor,
swapped tool/payload, changed target or task phase, expired approval, simulator
failure, controller stop, uplink loss, direct topic bypass, and restart/replay.
For each case record the proposed action, observed scene digest/epoch, receipt,
gateway decision, dispatch result, physical outcome, and latency. Separate
simulation, shadow, and live-cell measurements with raw denominators. A green
unit suite or signed deterministic receipt alone does not certify robot safety.

### Reproducible work commands

```bash
git status --short --branch
pnpm install --frozen-lockfile
pnpm run verify
pnpm run docs:build
git diff --check
gh pr list --state open
```

`pnpm run verify` covers build, typecheck, workspace tests, and the integration
gate. CI also runs PostgreSQL and Redis service integration tests; local
service-dependent runs need those services configured. Keep 0 test failures,
target `main`, and verify PR checks before merge. Record any remaining hardware
or calibration gap in this roadmap rather than marking an interface or fixture
as a live safety mechanism.
