# Humanoid Robotics Integration Roadmap 2026

This roadmap translates the humanoid robotics market strategy in
`HUMANOID_ROBOTICS_MARKET_ANALYSIS_SINT_STRATEGY.md` into repo-level execution
steps.

The strategy document points to one strong product thesis: humanoid companies
are moving from pilots to production, but their governance surface is still
fragmented across fleet platforms, robot middleware, compliance teams, safety
controllers, and insurance workflows. SINT should become the neutral
authorization, evidence, and compliance layer between AI autonomy and physical
actuation.

## Integration Thesis

Do not start with vendor-specific SDK promises. Start with the surfaces already
shared across humanoid deployments:

- ROS 2 action and topic control
- Open-RMF / fleet dispatch handoffs
- OPC UA / PLC / safety-controller permits
- MQTT Sparkplug / industrial telemetry
- MCP / agent tool governance
- evidence exports for compliance, insurance, and incident review

Vendor adapters for Arc, Helix, BrainNet, Gemini Robotics, or proprietary VLA
stacks should be added only after a design partner gives access to a real API
or simulator contract.

## Priority Segments

### Segment A. Production Warehouse / RaaS Humanoids

Primary fit: Agility-style RaaS deployments, GXO/Amazon-style logistics,
multi-robot warehouses.

Why first:

- existing SINT bridges already cover the core paths: ROS 2, Open-RMF, OPC UA,
  MQTT/Sparkplug, MCP
- liability and insurance are immediate because the provider may retain robot
  ownership
- measurable pilot success is possible without consumer-home or medical-device
  scope

Required integrations:

- ROS 2 `cmd_vel`, navigation, manipulation, gripper, and action-goal profiles
- Open-RMF fleet dispatch and robot handoff receipts
- safety-controller permit and e-stop state synchronization
- per-shift evidence export for incidents, near misses, and T2/T3 approvals

### Segment B. EU AI Act / CE Documentation

Primary fit: EU humanoid and modular robotics vendors, plus non-EU vendors
selling into the EU.

Why second:

- Article 13 transparency and Article 14 human oversight map directly to SINT
  logs, approval tiers, and proof receipts
- this is a documentation and export product on top of existing evidence
  primitives
- it helps convert pilots into audited adoption evidence

Required integrations:

- EU AI Act Article 13/14 evidence export
- ISO 13482 service-robot safety crosswalk
- Annex IV technical-documentation checklist
- notified-body review package template

### Segment C. Automotive / Industrial Humanoids

Primary fit: BMW/Mercedes/BYD/Airbus-style pilots, industrial cells, material
handling, assembly, inspection.

Why third:

- safety-controller integration is already on the roadmap
- customers need FMEA/SOTIF-style evidence before expanding robot autonomy
- existing OPC UA and Sparkplug bridges provide a credible first path

Required integrations:

- ISO 26262 / SOTIF mapping for AI-controlled physical actions
- FMEA export from SINT denial, escalation, rollback, and e-stop events
- industrial cell policy templates for humanoid-in-the-loop operations
- robot-zone occupancy and shared-workspace collision governance

### Segment D. Consumer And Medical Humanoids

Primary fit: home humanoids, rehabilitation robots, hospital service robots.

Why later:

- higher privacy and regulatory complexity
- medical and home consent requirements need careful product and legal review
- useful primitives should be built, but broad claims should wait for partners

Required integrations:

- multimodal human consent events
- room / patient / caregiver consent scopes
- CPSC and HIPAA/FDA-oriented evidence exports
- privacy-preserving camera and microphone governance

## Roadmap

### H1. Humanoid Bridge Profile Pack

Target: immediate.

Deliverables:

- define `humanoid://` resource URI conventions for robot, limb, end-effector,
  navigation, battery, safety, and workspace resources
- add canonical tier mapping for:
  - observe status / battery / pose: T0
  - plan route / stage grasp / reserve zone: T1
  - move base / move arm / grip / handoff: T2
  - enter novel workspace / disable safety envelope / persistent autonomy
    change: T3
- add conformance fixtures for pick, place, navigate, battery swap, handoff,
  shared-zone conflict, and emergency stop
- map the profile onto existing ROS 2 and Open-RMF bridges before creating a
  new vendor-specific package

Exit criteria:

- one fixture file covers the common humanoid lifecycle
- ROS 2 and Open-RMF tests prove equivalent SINT tiering for the same humanoid
  intent
- no bridge bypasses `PolicyGateway.intercept()`

### H2. Warehouse RaaS Pilot Kit

Target: next production adoption push.

Status: started.

Deliverables:

- `docs/guides/humanoid-warehouse-pilot.md` (published)
- deployment topology for 10-50 robots behind a gateway (published)
- per-shift audit export: robot, operator, token, assigned tier, approval,
  denial, rollback, e-stop, latency
- incident replay procedure with EvidenceLedger chain verification
- insurance / workers' comp evidence JSON Lines export

Executable artifacts:

- `packages/conformance-tests/fixtures/physical-ai/humanoid-warehouse-pilot.v1.json`
- `packages/conformance-tests/src/humanoid-warehouse-pilot-conformance.test.ts`

Exit criteria:

- a design partner can run a 90-day pilot using existing bridges
- pilot success metric is externally reviewable: insurer, safety auditor,
  customer safety team, or independent evaluator
- output can be cited as adoption evidence without relying on co-design claims

### H3. EU AI Act Conformity Pack

Target: Q3 2026.

Status: started.

Deliverables:

- `docs/guides/eu-ai-act-conformity-pack.md` (published)
- Article 13 transparency export from SINT schema and policy metadata
- Article 14 human-oversight export from T2/T3 approval evidence
- Annex IV checklist template referencing SINT token, gateway, ledger, and
  rollback artifacts
- ISO 13482 crosswalk section for service robots operating near humans

Executable artifacts:

- `packages/conformance-tests/fixtures/compliance/eu-ai-act-conformity-pack.v1.json`
- `packages/conformance-tests/src/eu-ai-act-conformity-pack-conformance.test.ts`

Exit criteria:

- docs build includes a self-contained conformity package
- examples are generated from real fixture data, not hand-written claims
- one external reviewer can validate whether the package is usable

### H4. Multi-Vendor Fleet Governance

Target: Q4 2026.

Status: started.

Deliverables:

- `docs/guides/multivendor-fleet-governance.md` (published)
- Open-RMF handoff receipts for humanoid-to-AMR workflows
- shared-zone policy fixture for humanoid + AMR + conveyor + human worker
- cross-bridge replay showing the same intent through ROS 2, Open-RMF, OPC UA,
  and Sparkplug
- fleet dashboard requirements document for 1,000+ robot audit queries

Executable artifacts:

- `packages/conformance-tests/fixtures/physical-ai/humanoid-multivendor-fleet.v1.json`
- `packages/conformance-tests/src/humanoid-multivendor-fleet-conformance.test.ts`

Exit criteria:

- conformance tests prove no handoff can occur without an auditable receipt
- conflicting robot claims on the same workspace escalate or deny fail-closed
- dashboard requirements are backed by query and storage benchmarks

### H5. Automotive And Industrial Safety Pack

Target: Q4 2026 to Q1 2027.

Deliverables:

- industrial humanoid policy templates
- FMEA export from SINT event categories
- safety-controller permit timing report
- SOTIF / ISO 26262 mapping draft for AI-generated physical actions

Exit criteria:

- at least one industrial-cell scenario covers guard-door interlock, zone
  occupancy, permit revocation, and emergency stop
- benchmark report includes hardware permit and e-stop timing
- claims remain "alignment support" unless a certified assessor signs off

### H6. Consent And Regulated-Domain Extensions

Target: Q1 2027.

Deliverables:

- multimodal consent event schema
- patient / worker / resident consent scopes
- privacy-preserving evidence rules for cameras, microphones, and biometric
  sensors
- medical and consumer incident-reporting export prototypes

Exit criteria:

- consent evidence is token-bound and revocable
- SINT can prove who authorized a high-risk robot action without storing more
  personal data than required
- medical and consumer modules are clearly marked experimental until partner
  validation exists

## This Week

1. Open GitHub issues for H1, H2, and H3.
2. Implement the humanoid profile fixture before creating new bridge packages.
3. Draft the warehouse pilot guide around existing ROS 2, Open-RMF, OPC UA, and
   Sparkplug paths.
4. Build the first EU AI Act export from current conformance fixture data.
5. Prepare three outreach packages:
   - warehouse / RaaS liability
   - EU AI Act conformity
   - post-security-incident fleet hardening

## Non-Goals

- claiming certified compliance before an external assessor validates it
- creating proprietary vendor adapters without real API access
- shipping paid compliance modules before the open conformance path is solid
- expanding into medical/home humanoids before the warehouse and EU packs are
  credible

## Success Metrics

- one independent warehouse or industrial pilot using SINT in a real deployment
- one external reviewer of the EU AI Act / ISO 13482 conformity pack
- one multi-vendor fleet scenario with reproducible conformance tests
- one external maintainer or adopter contributing integration fixtures for at
  least 90 days
