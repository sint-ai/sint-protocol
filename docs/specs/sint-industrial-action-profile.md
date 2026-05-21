# SINT Industrial Action Profile

This profile defines the first factory-control standard pack for SINT.

It does not try to replace TIA Portal, RobotStudio, ROBOGUIDE, RoboDK, KUKA.Sim,
or digital-twin authoring tools. It gives SINT a canonical control surface for
what happens after a prompt-generated industrial plan gets close to execution.

## Goal

Turn generated industrial intent into structured objects that can be:

- simulated
- approved
- denied
- executed
- audited
- settled

The control question is the core of the profile:

```text
factory intent -> structured plan -> simulation proof -> approval gate -> execution receipt
```

## Profile Objects

The first profile pack introduces four primary objects:

1. `FactoryIntent`
2. `CellGraph`
3. `RobotActionProfile`
4. `SimulationReceipt`

Supporting artifacts:

- `industrial-policy.yaml`
- the refusal-first demo narrative in
  [Factory Action Pack Demo](../guides/factory-action-pack-demo.md)

## Canonical Flow

### 1. Factory Intent

`FactoryIntent` captures the requested outcome:

- production goal
- industry context
- materials and stations
- throughput, capex, and floor-space constraints
- target safety standards

This is not an execution object. It is the auditable planning request.

### 2. Cell Graph

`CellGraph` normalizes the planned workcell:

- assets
- controllers
- adapters
- safety zones
- material flows
- approval tier

The graph is where generated planning turns into a bounded execution surface.

### 3. Robot Action Profile

`RobotActionProfile` gives SINT one canonical robot action language across
vendors.

The same action shape can later be translated into:

- RAPID
- KRL
- FANUC LS/TP
- URScript
- ROS 2
- SRCI
- PLC or motion-controller profiles

### 4. Simulation Receipt

`SimulationReceipt` is the proof object for simulation-first control.

It binds:

- cell identity
- simulator identity
- vendor program hash
- collision result
- cycle time
- force envelope
- execution-readiness decision

The point is simple: no serious physical action should rely on vibes when a
simulation proof object can exist.

## URI And Resource Guidance

The factory-control pack uses canonical resource URIs so the existing
`PolicyGateway` can reason about industrial actions without special-case hacks.

Recommended forms:

- `factory://intent/<intent_id>`
- `factory://cell/<cell_id>`
- `factory://cell/<cell_id>/asset/<asset_id>`
- `factory://cell/<cell_id>/simulation/<simulation_receipt_id>`
- `factory://cell/<cell_id>/robot/<robot_id>/action/<action_type>`

These URIs should remain boring and stable. The adapter-specific details belong
in adapter metadata, not in the canonical control surface.

## Tier Guidance

Default tier expectations:

| Surface | Default tier | Notes |
| --- | --- | --- |
| Read factory plan metadata | `T0_observe` | review only |
| Save or modify intent draft | `T1_prepare` | planning surface |
| Request simulation run | `T1_prepare` | no real actuation |
| Approve simulated robot motion | `T2_act` or `T3_commit` | depends on action and environment |
| Send live robot or PLC action | `T2_act` or `T3_commit` | requires policy evaluation |
| Disable safety envelope or execute irreversible cell change | `T3_commit` | mandatory human oversight |

## Adapter Contract

The first industrial adapters should preserve these rules:

- adapters translate, but do not authorize
- all authorization still flows through `PolicyGateway.intercept()`
- simulation artifacts produce receipts, not trust by assertion
- vendor code generation is gated by the same structured control objects

Target adapter families:

- Siemens TIA / SRCI
- ABB RAPID / RobotStudio
- KUKA KRL / KUKA.Sim
- FANUC LS/TP / ROBOGUIDE
- Universal Robots URScript / PolyScope / ROS 2 / SRCI
- Beckhoff TwinCAT / EtherCAT
- Rockwell FactoryTalk / Emulate3D

## Files In This Pack

- [Factory Intent Schema](./factory-intent.schema.json)
- [Cell Graph Schema](./cell-graph.schema.json)
- [Robot Action Schema](./robot-action.schema.json)
- [Simulation Receipt Schema](./simulation-receipt.schema.json)
- [Industrial Policy Pack](./industrial-policy.yaml)
- [Factory Action Pack Demo](../guides/factory-action-pack-demo.md)

## Why This Matters

Prompt-generated industrial design is becoming easier.

The missing control layer is not another generator. It is the thing that can
say:

- simulation proof is missing
- human approval is required
- force exceeds the approved envelope
- the safety zone is occupied
- the action is denied and the denial itself is auditable

That is the job of this profile.
