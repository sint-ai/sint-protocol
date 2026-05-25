# SINT Protocol

SINT is the runtime governance layer for actions with real-world consequence.

It sits between an agent decision and the system that can actually execute that
decision: a robot, an actuator, a drone, a tool bridge, a smart-home device, or
another agent runtime.

## The Core Loop

```text
request -> capability token -> PolicyGateway.intercept() -> allow | deny | escalate -> EvidenceLedger receipt
```

That loop is the whole point.

SINT does not try to replace MCP, ROS 2, Open-RMF, MAVLink, OPC UA, Matter, or
application logic. It gives those systems a common policy and evidence boundary
when an action crosses from "planned" to "can actually happen."

## Core Primitives

### Capability Tokens

- Ed25519-signed
- attenuation-only delegation
- physical constraints embedded in the token
- revocable in real time

### Policy Gateway

- single choke point for every authorization decision
- T0-T3 approval tiers
- rate limits, quorum hooks, forbidden-sequence checks
- fail-closed posture for production use

### Evidence Ledger

- append-only
- SHA-256 hash-chained
- decision and outcome receipts
- supports tamper-evident review and post-incident analysis

## What Ships Today

The repository already ships a production-minded protocol surface:

- fail-closed gateway patterns with durable PostgreSQL + Redis backing
- approval streaming and operator workflows
- bridge coverage across MCP, A2A, ROS 2, MAVLink, OPC UA, MQTT/Sparkplug,
  Open-RMF, Matter, Home Assistant, health, economy, and related execution
  paths
- certification and conformance lanes for protocol, industrial, and security
  behavior
- physical AI collaboration fixtures for:
  - Open-RMF fleet handoffs
  - MoveIt manipulation execution
  - Nav2 navigation and docking
  - PX4 offboard control
  - LeRobot learned-policy actuation
  - solar field operations

This is not just a spec repo. The current work is focused on making the
reference implementation legible, reviewable, and deployable.

## Production Direction

The current protocol work is biased toward four things:

1. production-ready gateway behavior
2. bridge-specific policy boundaries
3. conformance and evidence artifacts
4. external adoption and maintainership proof

That means the near-term priority is not adding every possible new feature. It
is tightening the surfaces that matter:

- durable state and readiness checks
- policy templates for real deployments
- evidence dossiers and release gates
- security and OpenSSF hygiene
- collaborator-facing fixtures that let other projects critique the boundary

## Factory Action Pack Direction

The next industrial upgrade for SINT is not "support more vendors" in the
abstract.

It is to become the control layer between AI-generated factory plans and
real-world execution.

As tools like [iOrchestra](https://iorchestra.ai/),
[Siemens Industrial Copilot](https://www.siemens.com/en-us/company/insights/generative-ai-industrial-copilot/),
[ABB RobotStudio AI Assistant](https://www.abb.com/global/en/areas/robotics/products/software/robotstudio-suite/robotstudio-ai-assistant),
and [Rockwell Emulate3D](https://www.rockwellautomation.com/en-us/products/software/factorytalk/designsuite/emulate3d-digital-twin.html)
make prompt-generated industrial engineering more real, the missing layer shifts
from creation to control.

SINT should own the questions that matter once a generated plan gets close to a
real floor:

- who is allowed to run it
- what machine or controller can execute it
- what simulation proof is required
- what safety envelope applies
- what human approval is required
- what receipt gets written after execution or refusal

The planned factory-control primitives are:

- `FactoryIntent`
- `CellGraph`
- `RobotActionProfile`
- `SimulationReceipt`
- industrial policy packs
- settlement metadata for reusable industrial skills and adapters

The first shipped factory-control pack now includes:

- [Industrial Action Profile](./specs/sint-industrial-action-profile.md)
- [Factory Intent Schema](./specs/factory-intent.schema.json)
- [Cell Graph Schema](./specs/cell-graph.schema.json)
- [Robot Action Schema](./specs/robot-action.schema.json)
- [Simulation Receipt Schema](./specs/simulation-receipt.schema.json)
- [Industrial Policy Pack](./specs/industrial-policy.yaml)
- [Factory Action Pack Demo](./guides/factory-action-pack-demo.md)

The active roadmap for that lane lives here:

- [Factory Action Pack Upgrade Sprints](./roadmaps/factory-action-pack-upgrade-sprints.md)

The coordination-upgrade lane that builds graph-native multi-party governance
on top of existing SINT receipts and policy events lives here:

- [Graph-First Coordination Upgrade 2026](./roadmaps/graph-first-coordination-upgrade-2026.md)

## Where To Start

- [Getting Started](./getting-started.md)
- [Protocol Spec v0.2](./SINT_v0.2_SPEC.md)
- [Gateway Production Hardening](./guides/gateway-production-hardening.md)
- [Production Slice Verification](./guides/production-slice-verification.md)
- [Roadmap](./roadmap.md)

## Current Execution Lens

If you want the honest current protocol story in one sentence:

SINT is moving from a broad reference architecture into a production protocol
surface with stronger release gates, stronger evidence, and sharper integration
boundaries for physical AI.
