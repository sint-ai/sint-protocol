# Roadway Edge Intelligence Roadmap

Status: proposed 2026 upgrade lane

This roadmap translates the current XRoadz-style smart roadway pattern into
SINT protocol work. It is not an XRoadz integration. It is a vendor-neutral
upgrade path for traffic-safety, roadway analytics, crash-prevention, connected
intersection, and public-safety deployments where edge AI and traffic-control
systems can affect people, vehicles, emergency response, and city operations.

## External Signal

XRoadz publicly positions its platform around:

- roadway analytics, crash prevention, and automated investigation tools for
  urban road safety and security;
- A.I. 1, a real-time edge-AI platform integrating robotics sensors and
  on-device intelligence;
- traffic-control-system and robotics expertise for roadway safety and
  efficiency;
- computer vision, mobility, human interface, routing optimization, and safety
  systems;
- public-sector impact areas including safety, congestion, emissions, energy,
  and roadway incident cost reduction.

Relevant adjacent standards and deployment surfaces:

- SAE J2735 connected-vehicle messages such as SPaT, MAP, BSM, PSM, TIM, SRM,
  and SSM.
- NTCIP 1202-style traffic signal controller monitoring and control.
- Roadside units, V2X hubs, connected signalized intersections, emergency
  vehicle preemption, transit/freight priority, pedestrian safety, and work-zone
  warnings.

Sources reviewed:

- XRoadz home page: https://xroadz.ai/
- XRoadz impact page: https://xroadz.ai/impact
- XRoadz about page: https://xroadz.ai/about
- XRoadz team page: https://xroadz.ai/team
- XRoadz LinkedIn profile: https://www.linkedin.com/company/xroadz
- FHWA V2X Hub technical brief
- FDOT CAV FAQ
- NTCIP 1202 public standard materials
- Connected-vehicle SPaT/MAP implementation guidance

## Strategic Read

Smart roadway platforms turn intersections, corridors, and work zones into
distributed cyber-physical systems:

- cameras, LiDAR, radar, loop detectors, and mobile devices detect roadway
  actors;
- edge models classify vehicles, pedestrians, cyclists, incidents, queues, and
  near misses;
- traffic controllers, RSUs, and V2X hubs broadcast SPaT/MAP/TIM/PSM and may
  request priority or preemption;
- city operators, public-safety teams, and transit/freight fleets rely on
  automated incident and routing decisions;
- evidence may later be used for crash investigation, agency review, insurance,
  civil claims, or criminal proceedings.

SINT should become the authority and evidence layer between "roadway AI
inferred" and "roadway infrastructure changed state or produced official
evidence."

## Product Thesis

For roadway edge intelligence, SINT should answer seven questions:

1. Which agency, operator, fleet, or edge node has authority at this
   intersection or corridor?
2. What traffic signal, lane, crosswalk, RSU, camera, model, and map revision
   constraints bind that authority?
3. Which actions can run automatically, and which require traffic engineer,
   dispatcher, police, fire, transit, or DOT approval?
4. What evidence proves the perception, localization, signal phase, preemption,
   and operator context at the moment of action?
5. How are vulnerable road users protected when model confidence, occlusion, or
   sensor health degrades?
6. How are privacy, retention, redaction, and chain-of-custody handled for
   automated investigation artifacts?
7. How does the system fail closed without making an intersection or emergency
   route unsafe?

## Upgrade Tracks

### R1. Intersection Authority Tokens

Goal: extend capability tokens for roadway infrastructure authority.

Deliverables:

- `RoadwayExecutionEnvelope` token extension covering:
  - agency/site authority
  - intersection or corridor ID
  - controller ID
  - RSU ID
  - allowed lanes, approaches, crosswalks, and movements
  - map/revision digest
  - signal phase and timing constraints
  - preemption/priority scope
  - permitted time windows and special-event modes
- attenuation rules proving a delegated edge node or fleet can only narrow
  authority.
- conformance fixtures for:
  - wrong intersection
  - stale MAP revision
  - unauthorized phase override
  - lane movement mismatch
  - out-of-window priority request

Target packages:

- `packages/core`
- `packages/capability-tokens`
- `packages/policy-gateway`
- `packages/conformance-tests`

### R2. Traffic Controller Adapter Pack

Goal: cover real traffic infrastructure actions, not only robot and factory
control actions.

Deliverables:

- traffic-controller resource model:
  - observe SPaT
  - observe detector state
  - request signal priority
  - request emergency preemption
  - change timing plan
  - place intersection in flash/fault mode
  - acknowledge controller fault
- default tiering:
  - observe SPaT/detectors: T0
  - priority request: T2
  - emergency preemption: T3 unless from authenticated emergency authority
  - timing-plan change: T3
  - flash/fault override: T3
- NTCIP-shaped adapter stubs for controller status and command surfaces.

Target packages:

- `packages/policy-gateway`
- `sint-industrial/adapters/opcua`
- `sint-industrial/adapters/modbus`
- new `packages/bridge-traffic-controller`

### R3. V2X Message Evidence

Goal: bind connected-vehicle messages to policy receipts.

Deliverables:

- receipt schemas for:
  - SPaT broadcast snapshot
  - MAP revision
  - BSM observation
  - PSM/vulnerable-road-user observation
  - TIM/work-zone message
  - SRM priority request
  - SSM priority/preemption status
- policy checks:
  - deny priority without authenticated requester
  - deny SPaT/MAP mismatch
  - deny stale MAP revision
  - escalate conflicting concurrent priority requests
  - require evidence of emergency vehicle clearance before ending preemption

Target packages:

- `packages/evidence-ledger`
- `packages/policy-gateway`
- `packages/conformance-tests`
- `apps/sintctl`

### R4. Vulnerable Road User Guard

Goal: make pedestrians, cyclists, scooter riders, construction workers, and
stopped vehicles first-class safety constraints.

Deliverables:

- `RoadwayActorContext`:
  - actor type
  - confidence
  - position and lane/crosswalk association
  - occlusion state
  - motion estimate
  - time-to-conflict
- policy checks:
  - deny phase/preemption action if crosswalk occupancy evidence conflicts
  - escalate low-confidence VRU classification near conflict zone
  - force fail-safe mode if sensor health is insufficient
  - require operator confirmation for automated incident classification used in
    official reporting

Target packages:

- `packages/core`
- `packages/policy-gateway`
- `packages/engine-system1`
- `packages/conformance-tests`

### R5. Automated Investigation Chain Of Custody

Goal: support crash/incident investigation without turning edge AI output into
unverified truth.

Deliverables:

- `RoadwayIncidentBundle`:
  - incident ID and roadway segment
  - detection model identity and fingerprint
  - sensor source and calibration state
  - relevant frames/clips/artifacts by digest
  - redaction status
  - confidence and uncertainty fields
  - operator review and disposition
  - chain-of-custody events
- evidence controls:
  - append-only incident timeline
  - redacted export mode
  - public-records export mode
  - law-enforcement restricted mode
  - correction event, never silent modification

Target packages:

- `packages/evidence-ledger`
- `apps/sintctl`
- `packages/persistence`
- `docs/guides`

### R6. Municipal Privacy And Retention Policy

Goal: make roadway AI usable for cities without ignoring civil liberties.

Deliverables:

- privacy policy plugin for roadway data:
  - face/license plate redaction requirement
  - retention windows by incident class
  - access role and purpose
  - export approval thresholds
  - differential privacy for aggregate analytics
- conformance fixtures for:
  - denied raw video export without purpose
  - automatic aggregate analytics allowed
  - incident evidence export requiring human approval
  - expired retention access denied

Target packages:

- `packages/policy-gateway`
- `packages/evidence-ledger`
- `packages/conformance-tests`
- `packages/bridge-health` privacy patterns as reference

### R7. Roadway Autonomy Supervisor

Goal: adapt managed-autonomy supervision to intersections and corridors.

Deliverables:

- roadway autonomy states:
  - normal monitoring
  - degraded perception
  - assisted operator review
  - regulated traffic-engineer control
  - fail-safe / local controller fallback
- automatic deautomation triggers:
  - sensor dropout
  - model confidence collapse
  - map/SPaT mismatch
  - conflicting priority requests
  - high near-miss rate
  - controller fault
  - communications loss
- dashboard copy for DOT operator, traffic engineer, emergency dispatcher, and
  public-safety reviewer roles.

Target packages:

- `packages/autonomy-supervisor`
- `packages/policy-gateway`
- `apps/dashboard`
- `apps/sint-interface`

### R8. Roadway Readiness Scorecard

Goal: measure whether a smart intersection deployment is actually safe to trust.

Metrics:

- percent of infrastructure-changing actions gated by SINT
- sensor health and calibration freshness
- SPaT/MAP consistency rate
- priority/preemption request denial and escalation rate
- VRU low-confidence rate
- incident evidence completeness
- operator intervention rate
- controller fallback events
- privacy/redaction compliance rate
- average approval latency for T2/T3 roadway actions

Deliverables:

- `sintctl roadway readiness report`
- dashboard panel for intersections and corridors
- evidence completeness report by incident and site
- docs explaining non-certification boundaries.

Target packages:

- `apps/sintctl`
- `apps/dashboard`
- `packages/evidence-ledger`
- `docs/reports`

## Execution Plan

### Sprint 1: Roadway Policy Shape

- define `RoadwayExecutionEnvelope`
- define roadway resource URI conventions
- define SPaT/MAP/BSM/PSM/SRM/SSM receipt schemas
- add fixtures for wrong intersection, stale map, and unauthorized phase change

### Sprint 2: Gateway Enforcement

- add roadway envelope validation to `PolicyGateway.intercept()`
- add default tier mappings for signal priority, emergency preemption, and
  timing-plan changes
- add VRU and sensor-health checks
- emit `roadway.policy.evaluated` and `roadway.controller.fail_safe` events

### Sprint 3: Adapter And Demo

- create `bridge-traffic-controller` skeleton
- add NTCIP-shaped status/command fixtures
- add V2X message evidence examples
- build a smart-intersection demo:
  `vehicle/VRU observed -> priority request -> SINT decision -> signal receipt`

### Sprint 4: Incident Evidence

- implement `RoadwayIncidentBundle`
- add `sintctl roadway incident export`
- add redacted and restricted export modes
- publish a sample incident evidence packet

### Sprint 5: Operator Workflow

- add dashboard panels for intersections, priority requests, VRU warnings, and
  incident evidence
- add role-specific approval language
- add readiness scorecard by corridor and site

## Definition Of Done

- Every infrastructure-changing traffic-control action flows through
  `PolicyGateway.intercept()`.
- SPaT/MAP, controller state, sensor health, and actor context are captured in
  receipts before priority, preemption, or timing changes.
- Emergency preemption and timing-plan changes are T3 unless a token carries
  explicit attenuated authority.
- Vulnerable-road-user uncertainty deautomates action rather than silently
  proceeding.
- Automated investigation evidence is hash-chained, redaction-aware, and
  correction-only.
- Privacy and retention decisions are enforceable policy, not dashboard-only
  preferences.
- Docs state claim boundaries clearly: SINT provides authorization, evidence,
  privacy, and runtime guardrails; it does not certify signal timing design,
  roadway engineering, sensor accuracy, legal admissibility, or municipal
  compliance by itself.

