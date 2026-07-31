# Humanoid Deployment Governance Roadmap

Status: proposed 2026 upgrade lane

This roadmap translates the Humanoid Atlas / Humanoids.fyi market-map signal
into SINT protocol work. It is not an integration with Humanoids.fyi. It is a
vendor-neutral plan for governing humanoid robot deployments across warehouses,
factories, shipyards, construction sites, public venues, homes, labs, and
mixed-human workspaces.

## External Signal

Humanoid Atlas presents the humanoid market as an ecosystem, not a single robot
category:

- 29+ humanoid OEMs, including industrial, logistics, household, research, and
  general-purpose platforms.
- 41+ hardware suppliers across motors, reducers, compute, batteries, sensors,
  actuators, screws, hands, bearings, and PCBs.
- VLA models that connect perception, language, and action.
- reward models for scoring robot task performance.
- world models for predicting how scenes evolve under robot actions.
- visualization/debugging tools such as Foxglove, Rerun, RViz2, MeshCat, and
  related robot-data tooling.
- head/display and human-robot interaction designs that shape human
  expectations, trust, and social behavior.

Adjacent research emphasizes that humanoids are not just another industrial
robot form factor. They combine physical, cognitive, social, and ethical design
risks because people interpret human-like bodies, gestures, displays, and
language as social cues. Other humanoid deployment research highlights that
pilots, operations, maintenance, and field reliability are the practical bridge
from impressive demos to scaled work.

Sources reviewed:

- Humanoid Atlas: https://www.humanoids.fyi/
- Humanoid Atlas GitHub repository:
  https://github.com/kingjulio8238/humanoid-atlas
- Humanoid Factors paper: https://arxiv.org/abs/2602.10069
- Humanoid Robots at work paper: https://arxiv.org/abs/2404.04249
- Public humanoid market maps and company directories covering Figure, Tesla,
  1X, Unitree, Agility, Boston Dynamics, Apptronik, UBTech, Fourier, NEURA,
  Sanctuary, Persona AI, Humanoid, and related suppliers.

## Strategic Read

Humanoid robots collapse several previously separate governance problems into
one runtime:

- human-shared mobility and manipulation;
- high-DOF actuation and whole-body contact risk;
- VLA foundation-model control;
- learned skill libraries and generated robot programs;
- teleoperation, autonomy, and assisted-control blending;
- social signaling through faces, displays, speech, posture, and gaze;
- supply-chain dependency on actuators, reducers, batteries, compute, sensors,
  hands, and safety-critical embedded components;
- fleet operations, maintenance, and incident reconstruction across many sites.

SINT should become the authority, evidence, and supervision layer that sits
between "a humanoid policy/model/skill wants to act" and "a human-shared
environment changes state."

## Product Thesis

For humanoid deployments, SINT should answer nine questions:

1. Which robot, model, operator, site, and task has authority right now?
2. What motion, force, torque, contact, geofence, posture, tool, and human-zone
   constraints bind that authority?
3. Which control mode is active: autonomous, teleoperated, assisted, supervised,
   or externally regulated?
4. Which VLA, world model, reward model, skill library, and generated program
   produced the proposed action?
5. Is the task within a certified or approved skill envelope, or is the robot
   attempting a novel behavior?
6. What evidence proves sensors, batteries, actuators, hands, tools, and safety
   systems were healthy before action?
7. How are human factors handled: intent signaling, proximity, gaze/display
   state, speech, privacy, and consent?
8. How does the deployment deautomate safely under uncertainty, drift, social
   confusion, component faults, or operator overload?
9. Can every incident be reconstructed from tamper-evident evidence?

## Upgrade Tracks

### H1. Humanoid Authority Envelope

Goal: define a first-class token envelope for whole-body humanoid operations.

Deliverables:

- `HumanoidExecutionEnvelope` token extension covering:
  - robot ID, fleet ID, and site ID
  - approved deployment profile
  - allowed work zones and human-shared zones
  - allowed postures and locomotion modes
  - allowed manipulation primitives
  - max translational, angular, joint, force, torque, jerk, and contact limits
  - tool/end-effector scope
  - battery, thermal, payload, and stability constraints
  - required sensor and safety-controller freshness
  - required human-communication mode for high-risk actions
- attenuation rules proving delegated humanoid authority only narrows scope.
- conformance fixtures for:
  - wrong robot identity
  - wrong site/work zone
  - forbidden posture or locomotion mode
  - end-effector mismatch
  - force/torque envelope breach
  - novel skill attempted under routine token

Target packages:

- `packages/core`
- `packages/capability-tokens`
- `packages/policy-gateway`
- `packages/conformance-tests`

### H2. Skill And VLA Provenance Guard

Goal: govern VLA and learned-skill execution the way SINT now governs
code-as-policy robot programs.

Deliverables:

- `HumanoidSkillMetadata`:
  - VLA model ID, version, and fingerprint
  - world model ID and fingerprint
  - reward model ID and fingerprint
  - skill library reference and digest
  - generated policy/program digest
  - primitive vocabulary
  - training/evaluation dataset references
  - approved task envelope
  - novelty and confidence score
- gateway checks:
  - deny mutated policy or skill digest
  - deny unapproved primitive introduction
  - escalate novel skill execution
  - require simulation receipt for generated whole-body behavior
  - require operator approval for cross-site skill transfer

Target packages:

- `packages/policy-gateway/src/code-as-policy-guard.ts`
- `packages/core`
- `packages/conformance-tests`
- `packages/evidence-ledger`

### H3. Whole-Body Kinetic Envelope

Goal: extend kinetic envelope work from single action parameters to full
humanoid body dynamics.

Deliverables:

- whole-body demand/capacity model reading:
  - base velocity and angular velocity
  - center-of-mass stability margin
  - joint states
  - foot contact state
  - hand contact state
  - tool force/torque
  - payload estimate
  - nearest human/obstacle distance
  - floor/surface confidence
  - trajectory novelty
- supervision mapping:
  - stable autonomy
  - metacognitive self-check
  - assisted operator review
  - regulated site authority
  - silent veto
- conformance vectors:
  - safe carry
  - human proximity deautomation
  - unknown floor surface assisted mode
  - payload instability veto
  - tool torque veto
  - bimanual manipulation requires assisted mode

Target packages:

- `spec/kinetic-envelope`
- `packages/policy-gateway`
- `packages/conformance-tests`
- `packages/bridge-ros2`

### H4. Human Factors And Social Signaling Policy

Goal: make humanoid-specific human interaction a runtime policy surface.

Deliverables:

- `HumanFactorsContext`:
  - human proximity and count
  - line-of-sight / gaze target
  - display/face state
  - speech/audio state
  - intent signal state
  - bystander consent and privacy context
  - vulnerable-person or public-space flags
  - operator load and takeover availability
- policies:
  - require visible/audible intent signal before moving near humans
  - deny deceptive or ambiguous display state during physical action
  - escalate interaction with vulnerable users
  - deny raw audio/video export without purpose and retention policy
  - require assisted mode when human intent is uncertain

Target packages:

- `packages/core`
- `packages/policy-gateway`
- `packages/bridge-health` privacy patterns as reference
- `apps/dashboard`

### H5. Component Supply-Chain And Maintenance Authority

Goal: treat humanoid hardware dependencies as safety-relevant runtime facts.

Deliverables:

- `HumanoidComponentManifest`:
  - actuator, motor, reducer, battery, sensor, hand, compute, and safety board
    identity
  - firmware/software versions
  - maintenance interval
  - calibration status
  - known component advisories
  - duty-cycle and wear counters
  - supplier provenance confidence
- gateway checks:
  - deny movement with stale actuator calibration
  - escalate operation with degraded hand tactile sensors
  - deny high-payload task with battery/thermal risk
  - deny task when component advisory marks required subsystem unsafe
- evidence export:
  - robot maintenance packet
  - component incident packet
  - fleet component exposure report

Target packages:

- `packages/core`
- `packages/policy-gateway`
- `packages/evidence-ledger`
- `apps/sintctl`

### H6. Teleoperation And Assisted-Control Guard

Goal: make remote human control and shared-control transitions auditable and
bounded.

Deliverables:

- `TeleoperationSession` schema:
  - operator identity
  - jurisdiction/site authorization
  - latency and packet-loss bounds
  - control authority scope
  - recording and privacy state
  - takeover reason
  - handoff and release receipts
- policy checks:
  - deny teleop without authenticated operator
  - deny operation if latency exceeds control envelope
  - require local human presence or site authority for high-risk teleop
  - append takeover/release events
  - forbid silent switch from autonomous to remote human control

Target packages:

- `packages/core`
- `packages/policy-gateway`
- `packages/evidence-ledger`
- `apps/dashboard`
- `apps/sint-interface`

### H7. Fleet Deployment And Site Readiness

Goal: let SINT score whether a humanoid deployment is ready for autonomy at a
specific site, not just whether a robot can do a demo.

Deliverables:

- `HumanoidSiteReadinessProfile`:
  - mapped zones and geofences
  - floor/surface classifications
  - charging and e-stop locations
  - operator coverage
  - network/edge control-plane availability
  - privacy/retention policy
  - task envelope and prohibited zones
  - emergency procedures
- readiness scorecard:
  - percent actions with complete spatial proof
  - percent actions with component health evidence
  - intervention rate
  - deautomation rate
  - near-miss / contact events
  - stale sensor or safety permit rate
  - evidence completeness
  - mean time between assistance requests

Target packages:

- `apps/sintctl`
- `apps/dashboard`
- `packages/evidence-ledger`
- `docs/reports`

### H8. Incident Reconstruction And After-Action Evidence

Goal: produce a signed, portable evidence packet for humanoid incidents.

Deliverables:

- `HumanoidIncidentBundle`:
  - robot/site/task identity
  - token and authority chain
  - model/skill/world-model provenance
  - physical context timeline
  - human factors timeline
  - component health timeline
  - teleop/takeover events
  - approvals and denials
  - e-stop and rollback events
  - redaction status
  - correction events
- `sintctl humanoid incident export`
- redacted export modes for employer, regulator, insurer, and public-review
  contexts.

Target packages:

- `packages/evidence-ledger`
- `apps/sintctl`
- `packages/persistence`
- `docs/guides`

## Execution Plan

### Sprint 1: Humanoid Authority Shape

- define `HumanoidExecutionEnvelope`
- add default humanoid resource URI conventions
- add conformance fixtures for robot/site/tool/posture mismatch
- document claim boundaries for humanoid deployments

### Sprint 2: VLA And Skill Provenance

- extend code-as-policy guard with humanoid skill metadata
- add VLA/world/reward model fingerprint checks
- add simulation receipt requirement for generated whole-body policies
- add fixtures for mutated skill, novel behavior, and cross-site transfer

### Sprint 3: Whole-Body Envelope

- extend kinetic-envelope spec with center-of-mass, foot/hand contact, payload,
  floor confidence, and bimanual manipulation context
- add conformance vectors
- wire supervision floor into gateway tiering behind an opt-in plugin

### Sprint 4: Human Factors And Teleop

- define `HumanFactorsContext`
- define `TeleoperationSession`
- add deny/escalate rules for ambiguous intent signaling, privacy-sensitive
  recording, latency breach, and silent takeover
- add dashboard operator copy

### Sprint 5: Fleet Readiness And Incident Evidence

- define `HumanoidSiteReadinessProfile`
- add `sintctl humanoid readiness report`
- implement `HumanoidIncidentBundle`
- publish a sample signed after-action evidence packet

## Definition Of Done

- Every humanoid physical action flows through `PolicyGateway.intercept()`.
- Robot, site, task, model, skill, component, teleop, and human-factor context
  are available as typed policy inputs.
- Unknown or novel humanoid behavior deautomates before execution.
- Whole-body kinetic envelope can deny or escalate based on stability, contact,
  payload, human proximity, and sensor confidence.
- Teleoperation and assisted control are explicit, authenticated, and
  hash-chained.
- Human-facing signals and privacy-sensitive sensors are governed by policy,
  not UI convention.
- Component health and maintenance state can block high-risk tasks.
- Incident bundles reconstruct what the humanoid believed, who had authority,
  which model/skill acted, what humans were nearby, and how the system stopped
  or recovered.
- Docs state claim boundaries clearly: SINT provides authorization, runtime
  guardrails, supervision, and evidence; it does not certify humanoid hardware,
  model competence, workplace safety, labor compliance, or legal admissibility
  by itself.

