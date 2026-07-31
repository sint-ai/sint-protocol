# Autonomous Factory Readiness Roadmap

Status: proposed 2026 upgrade lane

This roadmap translates the current Hadrian-style autonomous factory pattern
into SINT protocol work. It is not a Hadrian integration. It is a vendor-neutral
upgrade path for software-driven aerospace, defense, and industrial production
environments where factory autonomy, inspection, procurement, and full-rate
manufacturing must be gated by verifiable authority and evidence.

## External Signal

Hadrian publicly positions its factory stack around:

- Opus, a full-stack AI-powered platform for factory autonomy that interprets
  legacy designs and automates manufacturing and inspection.
- Production on demand, including precision components, manufacturing or
  inspection cells, and whole factories operated as a service.
- Flexible capacity, including Hadrian-operated dedicated facilities and
  production lines deployed into customer-owned facilities.
- Atlas supply-chain tooling for procurement, NPI-to-production transition,
  DFM support, embedded quality flowdowns, and real-time order visibility.
- Highly automated facilities integrating process engineering, AI, machine
  learning, robotics, CNC, additive, MES, SCADA, equipment-management, and
  manufacturing data-pipeline concerns.

Sources reviewed:

- Hadrian home page: https://www.hadrian.co/
- Hadrian about page: https://www.hadrian.co/about
- Hadrian Series C announcement: https://www.hadrian.co/blog/series-c
- Hadrian Atlas beta announcement: https://www.hadrian.co/blog/atlas
- GPEC Factory 3 announcement: https://www.gpec.org/news/press-releases/hadrian-ribbon-cutting-mesa/
- Public Hadrian job postings indexed by search for factory automation,
  controls, CNC, MES, SCADA, additive, and cybersecurity roles.

## Strategic Read

Autonomous factory platforms are turning the factory into a distributed cyber-
physical runtime:

- CAD/CAM/DFM software decides what is manufacturable.
- MES and schedulers decide what runs next.
- CNC, robotic, tooling, additive, and inspection cells execute physical work.
- Quality systems decide whether an artifact can move downstream.
- Supply-chain systems decide supplier routing, substitutions, and flowdowns.
- Defense programs require export, cybersecurity, chain-of-custody, and
  customer evidence.

SINT should become the policy and evidence layer at the boundary between
"software decided" and "factory state changed."

## Product Thesis

For autonomous factories, SINT should answer six questions:

1. Who or what has authority to run this operation?
2. What machine, fixture, tool, material, supplier, and quality constraints are
   bound to that authority?
3. Which operations can run autonomously, and which require operator,
   quality, engineering, export, or customer approval?
4. What evidence proves the right program, revision, machine state, inspection
   state, and flowdown were present before execution?
5. How do we stop, quarantine, or roll back a bad production branch?
6. How do we produce a portable after-action packet for audit, customer review,
   incident response, or government program evidence?

## Upgrade Tracks

### A1. Manufacturing Authority Tokens

Goal: extend capability tokens from generic physical constraints into
manufacturing-specific execution authority.

Deliverables:

- `ManufacturingExecutionEnvelope` token extension covering:
  - part number and revision
  - drawing/model/CAM/program digests
  - machine or cell identity
  - fixture/workholding/tooling set
  - material lot and allowed substitutions
  - operation route and sequence limits
  - quality plan and inspection requirements
  - export or customer flowdown markers
- attenuation rules proving delegated shop-floor authority only narrows scope.
- conformance fixtures for:
  - program digest mismatch
  - drawing revision mismatch
  - unauthorized material substitution
  - machine/cell mismatch
  - operation sequence skip

Target packages:

- `packages/core`
- `packages/capability-tokens`
- `packages/policy-gateway`
- `packages/conformance-tests`

### A2. Factory Cell Graph

Goal: make machine, robot, tooling, inspection, PLC, and MES dependencies
explicit before SINT allows an operation.

Deliverables:

- `CellGraph` v2 schema with nodes for CNC, robot, additive, inspection,
  fixture, material station, PLC, MES job, and quality gate.
- graph-level policy checks:
  - required upstream inspection exists
  - fixture and program are compatible
  - safety PLC/interlock state is fresh
  - cell reservation matches request
  - blocked or quarantined node cannot run
- Open-RMF-style handoff receipts for factory routing between cells.

Target packages:

- `packages/core`
- `sint-industrial/schemas`
- `sint-industrial/policies`
- `packages/bridge-open-rmf`
- `packages/policy-gateway`

### A3. CAD/CAM/DFM Guard

Goal: treat design-to-manufacturing translation as code-as-policy, not just
engineering metadata.

Deliverables:

- DFM verdict schema:
  - manufacturability score
  - critical tolerances
  - machine/process assumptions
  - required inspection features
  - nonconformance risk flags
- CAM/program binding:
  - source design digest
  - postprocessor identity
  - generated program digest
  - simulation receipt digest
  - approved primitive/macro vocabulary
- policy decisions:
  - deny if CAM does not match approved design revision
  - escalate if DFM verdict is below threshold
  - require engineering approval for critical tolerance override

Target packages:

- `packages/policy-gateway/src/code-as-policy-guard.ts`
- `packages/conformance-tests/fixtures/physical-ai`
- `sint-industrial/adapters`

### A4. Inspection And Quality Evidence

Goal: make automated inspection a first-class gate that can release, hold, or
quarantine production.

Deliverables:

- `InspectionReceipt` schema:
  - inspection plan digest
  - instrument identity and calibration state
  - measured feature results
  - pass/fail/conditional disposition
  - operator or quality approver identity
  - nonconformance and rework links
- gateway checks:
  - required inspection receipt before downstream operation
  - calibration state fresh and valid
  - failed inspection blocks shipment or next route step
  - conditional pass escalates to quality review
- evidence export:
  - per-part trace bundle
  - lot-level quality packet
  - customer-facing proof receipt

Target packages:

- `packages/evidence-ledger`
- `packages/policy-gateway`
- `apps/sintctl`
- `sint-industrial/schemas`

### A5. MES / SCADA / PLC Adapter Pack

Goal: cover the real factory control plane, not only robot examples.

Deliverables:

- MES job adapter profile:
  - release job
  - hold job
  - split lot
  - route operation
  - change priority
- SCADA/equipment adapter profile:
  - start cycle
  - stop cycle
  - change recipe
  - override alarm
  - acknowledge fault
- PLC safety profile:
  - interlock closed
  - guard door state
  - e-stop state
  - safe torque off
  - light curtain
  - permit-to-run
- conformance fixtures for unsafe recipe change, stale PLC permit, and alarm
  override requiring T3 approval.

Target packages:

- `sint-industrial/adapters/opcua`
- `sint-industrial/adapters/modbus`
- `sint-industrial/adapters/mqtt`
- `packages/bridge-opcua`
- `packages/bridge-mqtt`
- `packages/policy-gateway`

### A6. Supply Chain Authority And Flowdowns

Goal: govern procurement and supplier routing decisions that can change
manufacturing risk without touching a robot.

Deliverables:

- supplier authority token extension:
  - supplier identity
  - process capability
  - certifications
  - export/domestic-source restrictions
  - approved material and special-process scope
- flowdown evidence:
  - customer clauses
  - inspection requirements
  - material cert requirements
  - cybersecurity/export restrictions
- policy checks:
  - deny unapproved supplier substitution
  - escalate off-contract process change
  - require quality approval for alternate material

Target packages:

- `packages/core`
- `packages/policy-gateway`
- `packages/evidence-ledger`
- `packages/bridge-economy`

### A7. Factory Autonomy Supervisor

Goal: adapt managed-autonomy supervision to production cells and factory
schedulers.

Deliverables:

- factory autonomy states:
  - stable production
  - metacognitive self-check
  - assisted operator review
  - regulated quality/customer control
  - quarantined cell
- automatic deautomation triggers:
  - repeated denials
  - rising scrap/rework
  - inspection drift
  - machine health degradation
  - late calibration
  - supplier or material anomaly
- dashboard and approval copy for operator, quality, engineering, and program
  owner roles.

Target packages:

- `packages/autonomy-supervisor`
- `packages/policy-gateway`
- `apps/dashboard`
- `apps/sint-interface`

### A8. Per-Part Digital Thread And Trace Bundle

Goal: produce one portable evidence packet from raw material through finished
artifact.

Deliverables:

- `PartTraceBundle`:
  - authority tokens
  - route steps
  - program and fixture digests
  - material lot evidence
  - machine/cell state
  - inspection receipts
  - approvals
  - nonconformance and rework events
  - shipment/release disposition
- `sintctl factory trace export`
- hash-chained JSONL and signed bundle output
- customer-safe redaction modes.

Target packages:

- `packages/evidence-ledger`
- `apps/sintctl`
- `docs/guides`

### A9. Factory Readiness Scorecard

Goal: make "deployment-ready autonomous factory" measurable.

Metrics:

- percent of physical operations gated by SINT
- percent of operations with valid spatial/cell/machine context
- percent of operations with complete design/program/inspection evidence
- autonomous vs assisted vs regulated operation ratio
- intervention rate
- stale permit rate
- nonconformance escape rate
- average approval latency
- evidence completeness by part, lot, cell, and supplier

Deliverables:

- CLI report command
- dashboard panel
- benchmark fixture pack
- docs explaining non-certification boundaries.

Target packages:

- `apps/sintctl`
- `apps/dashboard`
- `packages/evidence-ledger`
- `docs/reports`

## Execution Plan

### Sprint 1: Protocol Shape

- define `ManufacturingExecutionEnvelope`
- define DFM, CAM, inspection, and cell graph schema stubs
- add conformance fixtures for digest mismatch, stale inspection, and material
  substitution
- document threat model for autonomous factory execution

### Sprint 2: Gateway Enforcement

- add manufacturing envelope validation to `PolicyGateway.intercept()`
- wire quality and inspection receipt requirements
- add PLC permit freshness checks for factory-cell profiles
- emit `factory.policy.evaluated` and `factory.cell.quarantined` events

### Sprint 3: Adapter Pack

- add MES/SCADA/PLC adapter profiles under `sint-industrial`
- extend OPC UA and MQTT examples with recipe, job, alarm, and permit flows
- create a factory-cell demo that proves `request -> decision -> receipt`

### Sprint 4: Evidence Export

- implement `PartTraceBundle`
- add `sintctl factory trace export`
- add lot-level and customer-safe redaction modes
- publish a sample signed trace packet

### Sprint 5: Operator Workflow

- add dashboard views for quality holds, engineering overrides, and quarantined
  cells
- add role-specific approval copy
- add scorecard metrics for deployment readiness

## Definition Of Done

- All new factory-control invariants have executable conformance fixtures.
- No adapter makes an authorization decision outside `PolicyGateway.intercept()`.
- Generated programs, recipes, and route changes are digest-bound before
  execution.
- Inspection evidence gates downstream operations.
- PLC/interlock/e-stop state is fresh for every physical operation that needs
  it.
- Supplier and material substitutions are deny-or-escalate, never silent.
- Per-part trace bundles can be exported from the evidence ledger.
- Docs state claim boundaries clearly: SINT provides authorization, evidence,
  and runtime guardrails; it does not certify machine capability, part quality,
  or regulatory compliance by itself.

