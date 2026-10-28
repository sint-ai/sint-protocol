# Embodied authorization: whitepaper execution roadmap

**Baseline:** `8ba9660` (24 October 2026). The external repository audit examined
`915b4d7`; the current checkout already contains the predictive execution broker,
signed simulation evidence policy, world snapshot adapter, and simulation server.
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
motion model still checks declared effect parameters. Deterministic receipts
now report zero sampled-scenario coverage until a real scenario runner exists.
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
   stale or internally inconsistent scenes.
3. **Add scenario generation.** Build a bounded, reproducible scenario sampler
   and adversarial case library per effect class. The gateway now supports an
   exact required scenario-set digest and rejects coverage thresholds without
   one. Configure it once an approved set exists.
   Log seeds and distributions;
   prohibit a model-generated "safe" label from becoming a policy decision.
4. **Add a physical simulator adapter.** Run the same effect against a real
   Gazebo/MoveIt or equivalent backend and deterministic envelope checker.
   Record pass, fail, indeterminate, unsupported phenomena, latency, and traces
   in the signed receipt. The existing deterministic simulator remains a
   narrower software check until this adapter is measured.
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
| 1 | Simulation-before-dispatch for every physical effect | Every T2/T3 physical command and bounded VLA chunk has an exact, fresh, signed pass receipt; failed/indeterminate/absent evidence cannot dispatch | Production gateway requires trusted simulator signers and signed V2 receipts for T2/T3. Known physical transport commands now have a T2 floor even if a site rule labels them T0/T1; explicit read and staging actions retain lower tiers. An opt-in scene-aware navigation model checks a bounded collinear waypoint path and conservative stop corridor against stored ROS 2 scene geometry, including measured position and moving-object speed-error bounds. Turns and reversals return indeterminate. Production workers reject the default parameter-only ROS 2 model. Probabilistic scenario generation, physical simulator adapter, generic-tool effect classification, complete dispatch inventory and bypass proof remain pending. |
| 2 | Scene-bound permits and edge continuity | Scene, robot, payload, policy and simulator digests bound; state change invalidates permit; nonce survives restart; offline runner holds a safe state | Snapshot binding exists in predictive path; the broker now re-reads scene digest and epoch after nonce consumption and rejects drift before adapter dispatch. File-backed edge nonce consumption survives restart when configured. Atomic controller-side scene locking, controller hold, and complete binding remain pending. |
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

## Next implementation slice

1. Inventory every physical dispatch entry point and require V2 signed
   simulation evidence on each production path; add bypass and replay tests.
2. Specify the versioned synthetic scene and scenario-set receipt extensions,
   including reproducible seeds, physical uncertainty bounds, and task phase.
3. Update the dashboard to sign vote payloads with operator-held keys and
   provision those keys separately from agent and proxy keys.
4. Add a network-target validation policy before enabling remote downstream
   transport; keep the current HTTP proxy loopback-only.
5. Wire the existing signed proof receipt into the ledger HTTP route, and
   define evidence retention by record class without deleting hash-chain events.
6. Require the durable edge replay store in deployments, then test a stale
   world snapshot at dispatch and a controller safe hold on link loss.
7. Build an adversarial conformance lane that runs those behaviors against
   production code, not fixture-only JSON assertions.
