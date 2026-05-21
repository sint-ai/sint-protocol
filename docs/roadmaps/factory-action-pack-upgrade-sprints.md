# Factory Action Pack Upgrade Sprints

This roadmap turns the recent industrial research into a concrete upgrade track
for SINT.

The key shift is simple: prompt-to-hardware and prompt-to-factory tooling is
getting better at generation. The missing layer is still control.

SINT should not try to out-compete design copilots on schematic generation,
offline programming, or factory layout authoring. It should become the control,
simulation, approval, audit, and settlement layer between AI-generated factory
plans and real execution.

## Research Verdict

The strongest public signal is that natural-language industrial engineering is
already arriving from multiple directions:

- [iOrchestra](https://iorchestra.ai/) is positioning around prompt-to-hardware
  and prompt-to-production documentation
- [Siemens Industrial Copilot](https://www.siemens.com/en-us/company/insights/generative-ai-industrial-copilot/)
  is pushing natural-language automation engineering and multi-vendor robot
  integration
- [ABB RobotStudio AI Assistant](https://www.abb.com/global/en/areas/robotics/products/software/robotstudio-suite/robotstudio-ai-assistant)
  and HyperReality are leaning into AI-assisted programming and simulation
- [Rockwell Emulate3D](https://www.rockwellautomation.com/en-us/products/software/factorytalk/designsuite/emulate3d-digital-twin.html)
  is pushing digital twins and virtual commissioning
- [SRCI](https://www.profibus.com/technologies/robotics-srci-standard-robot-command-interface)
  shows the cross-vendor robot-control trend is real
- [OPC UA](https://opcfoundation.org/) remains the vendor-neutral industrial
  data backbone
- [EU AI Act Article 14](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-14)
  keeps human oversight and override in scope for high-risk systems

The conclusion for SINT is larger than "support more robots."

```text
iOrchestra and industrial copilots: generate the factory plan
SINT: authorize, simulate, approve, execute, audit, and settle the factory action
```

## Category And Positioning

Category:

- Agentic Industrial Control Protocol

Working one-liner:

- prompt-generated factories need a control layer before they touch machines

Founder-facing line:

- the next factory will be generated from intent; SINT makes that safe enough
  to run

## Core Upgrade Surface

The factory-control lane should add six protocol primitives on top of the
existing gateway, token, tier, and evidence model.

### 1. Factory Intent

Structured intent turns "build me a packaging line" into auditable planning
input.

Planned object:

- `FactoryIntent`
- goal, industry, materials, stations, throughput, capex, floor-space,
  collaboration, and safety-standard targets

### 2. Cell Graph

A canonical production-cell graph lets SINT reason about assets, flows,
approval tiers, and safety boundaries.

Planned object:

- `CellGraph`
- assets, vendor/controller metadata, adapters, safety zones, and material
  flows

### 3. Robot Action Profile

SINT needs one action language that adapters can translate into RAPID, KRL,
TP/LS, URScript, ROS 2, SRCI, or PLC logic.

Planned object:

- `RobotActionProfile`
- motion, tool, force, velocity, collision, approval, and zone-clearance
  requirements

### 4. Simulation Receipt

Real-world execution should require simulation proof whenever the action
crosses into meaningful physical risk.

Planned object:

- `SimulationReceipt`
- simulator identity, program hash, collision status, cycle time, safety-zone
  violations, force envelope, and execution-readiness signature

### 5. Industrial Policy Engine

The existing `PolicyGateway` needs factory-grade rules layered on top of the
current tier and constraint model.

Examples:

- deny if human detected in zone
- deny if simulation receipt missing
- deny if motion exceeds approved velocity or force envelope
- require human approval for motion, weld, cut, lift, or dispense
- require lockout-tagout when maintenance mode is active

### 6. Factory Settlement

If SINT is going to host reusable industrial skills, adapters, policies, and
simulation templates, it should also model how those contributors get paid.

Planned object:

- `FactorySettlement`
- workcell ID, contributor shares, payment method, and settlement network

## Upgrade Architecture

```text
Prompt
  -> FactoryIntent compiler
  -> CellGraph + asset manifest
  -> simulation gateway
  -> PolicyGateway
  -> human approval / override
  -> vendor adapter
  -> PLC / robot / digital twin / MES
  -> execution receipt
  -> EvidenceLedger + settlement
```

## Sprint Plan

### Sprint 1. Control Standard Pack

Target:

- next 14 days

Status:

- completed
- tracking issue:
  [#202](https://github.com/sint-ai/sint-protocol/issues/202)

Goal:

- ship the factory-control standard before chasing hardware claims

Deliverables:

- `docs/specs/sint-industrial-action-profile.md` (shipped)
- `docs/specs/factory-intent.schema.json` (shipped)
- `docs/specs/cell-graph.schema.json` (shipped)
- `docs/specs/robot-action.schema.json` (shipped)
- `docs/specs/simulation-receipt.schema.json` (shipped)
- `docs/specs/industrial-policy.yaml` (shipped)
- `docs/guides/factory-action-pack-demo.md` with prompt to cell plan,
  simulation-required refusal, human approval, and signed receipt path
  (shipped)

Exit criteria:

- prompt-generated factory intent compiles into structured planning objects
- the default path fail-closes without simulation proof
- the demo shows refusal first, then controlled approval

Artifact links:

- [Industrial Action Profile](../specs/sint-industrial-action-profile.md)
- [Factory Intent Schema](../specs/factory-intent.schema.json)
- [Cell Graph Schema](../specs/cell-graph.schema.json)
- [Robot Action Schema](../specs/robot-action.schema.json)
- [Simulation Receipt Schema](../specs/simulation-receipt.schema.json)
- [Industrial Policy Pack](../specs/industrial-policy.yaml)
- [Factory Action Pack Demo](../guides/factory-action-pack-demo.md)

### Sprint 2. Simulation-First Factory Demo

Target:

- next 30 days

Status:

- planned

Goal:

- prove the control loop in simulation before touching real industrial
  execution

Deliverables:

- ROS 2 adapter upgraded to speak the factory action profile
- Universal Robots ROS 2 demo path
- ABB RAPID export stub
- FANUC LS/TP export stub
- SRCI command-profile mapping
- Isaac Sim, RoboDK, or Visual Components simulation receipt stub
- approval dashboard flow for industrial execution requests
- receipt-chain demo across plan, simulation, approval, and execution

Exit criteria:

- SINT refuses execution when simulation proof is missing
- after simulation passes, SINT still requires tier-appropriate approval
- the same action profile can fan out into at least two vendor execution stubs

### Sprint 3. Industrial Pack

Target:

- next 60 to 90 days

Status:

- planned

Goal:

- package SINT as a real industrial control surface, not just a robotics demo

Deliverables:

- `/sint-industrial/schemas`
- `/sint-industrial/policies`
- `/sint-industrial/adapters/ros2`
- `/sint-industrial/adapters/srci`
- `/sint-industrial/adapters/opcua`
- `/sint-industrial/adapters/mqtt`
- `/sint-industrial/adapters/modbus`
- `/sint-industrial/adapters/abb-rapid`
- `/sint-industrial/adapters/kuka-krl`
- `/sint-industrial/adapters/fanuc-ls`
- `/sint-industrial/adapters/ur-script`
- `/sint-industrial/adapters/beckhoff-twincat`
- `/sint-industrial/adapters/rockwell-factorytalk`
- `/sint-industrial/simulators/isaac-sim`
- `/sint-industrial/simulators/robodk`
- `/sint-industrial/simulators/robotstudio`
- `/sint-industrial/simulators/roboguide`
- `/sint-industrial/simulators/kuka-sim`
- `/sint-industrial/simulators/emulate3d`
- example cells for pick-place, inspection, palletizing, and hybrid workflows

Exit criteria:

- SINT can express one shared factory-control surface across at least three
  industrial execution paths
- simulation receipts, approvals, and audit receipts stay first-class across
  all examples
- the story is clear enough that a collaborator can plug in a real vendor API
  without changing SINT's governance model

## Adapter Priorities

The first vendor surfaces worth targeting are the ones that already sit near
multi-vendor industrial workflows:

- Siemens TIA Portal, SIMATIC robot integration, and SRCI
- ABB RobotStudio and RAPID
- KUKA.Sim and KRL
- Rockwell FactoryTalk and Emulate3D
- Beckhoff TwinCAT and EtherCAT
- FANUC ROBOGUIDE and LS/TP export
- Universal Robots PolyScope, URScript, ROS 2, and SRCI

## What Not To Do

Do not position SINT as another robot-programming suite.

That would put the project directly against vendor engineering environments and
offline programming tools.

The strategic wedge is narrower and stronger:

- SINT is the layer between AI-generated industrial automation and real-world
  execution
- SINT is where permission, simulation proof, human approval, audit, and
  settlement become mandatory

## Short Version

If this lane works, the message becomes very simple:

SINT Protocol is the control, safety, and settlement layer for AI-generated
factories.
