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

## MCP authorization semantics

`PolicyGateway.intercept()` enforces MCP risk classification for both direct API requests and bridged calls. Shell and execution tools require T3 approval; known destructive mutations require at least T2. Resource rules and tool semantics combine by taking the higher tier. MCP annotations can raise risk but cannot lower known policy or change capability-token actions. Server approval requirements and tier ceilings are evaluated at the same gateway boundary, and token-defined approval quorums carry through to the MCP proxy queue.

The scanner uses the same default resource rules and tool classifier. Runtime trust, custom rules, context, server restrictions, or action history may impose additional approval requirements. Shell keywords match word boundaries, including snake_case and camelCase, to avoid classifying names such as `publish_page` as shell tools.

Forbidden combinations normalize actual MCP tool identities and use gateway timestamps. Per-agent history spans sessions and tokens on a single gateway instance, is retained for at most 120 seconds, and fails closed at 1,024 relevant events rather than evicting live history. History is in memory: restart clears it, and separate gateway replicas do not share it. Deployments relying on sequence detection must route an agent to the same gateway instance.

## Plugin failure enforcement

Configured enforcement hooks fail closed on exceptions, rejected promises, explicit error results, malformed output, and async settlement timeouts. This includes circuit reads/updates/trips, token-bound rate limiting, budget checks/accounting, provenance verification, live envelopes, and hardware permits. A signed rate limit requires a backing store; omitting it is an unavailable enforcement dependency. A configured hardware resolver is authoritative over caller-supplied grants, and neither a resolver nor a plugin can clear a request e-stop. CSML cannot lower a consequence tier, and an anomalous circuit trip blocks the current request as well as subsequent requests.

`PolicyGatewayConfig.pluginTimeoutMs` is the per-hook async settlement deadline (default 2,000 ms, valid range 1–30,000 ms). Timeout does not cancel remote work or preempt a CPU-blocking synchronous plugin; isolate untrusted code outside the gateway process. Late fulfillment/rejection cannot change a completed decision. There is no implicit cached-state or static-envelope outage fallback.

`pluginFailurePolicies` can explicitly opt only `goalHijack.analyze`, `memoryIntegrity.check`, `csml.evaluateAgent`, or `argInjection.analyze` into `advisory` behavior at T0/T1. The default is `deny`. Authoritative seats cannot opt out. If another check promotes a request to T2/T3, prior advisory failures also deny. This is an intentional compatibility change from the former silent fail-open behavior: remove unused plugins instead of configuring no-op enforcement, and explicitly opt in only genuinely advisory low-consequence detectors.

Each failed hook produces a `policy.plugin.failed` event with request ID, seat, safe failure classification, and effective policy. The final decision carries the same failures in `transformations.additionalAuditFields.pluginFailures`, preserving other audit fields and original denials. The ledger receives one `policy.evaluated` record, including early returns, with correlated check outcomes and failure details. With a configured sink it marks `authorizationPendingAudit: true`: an evaluation record is not an execution receipt, and returning an authorization still requires the append acknowledgement. Raw exception messages/stacks are not copied into the decision or ledger.

When a configured primary ledger append fails or times out, authorization fails closed and the decision marks `auditStatus: unavailable`; it does not assert a successful durable write. Without a configured ledger, diagnostics explicitly say `not_configured`. Evidence replication and revocation relays remain optional telemetry: their failures are observable but do not grant authority or relax an existing denial. Replication is not a transactional outbox; there is no exactly-once or cross-store atomicity guarantee. Async ledger adapters must acknowledge only after durable commit. The built-in HTTP server serializes backing-store appends and latches unavailable after persistence rejection, requiring operator reconciliation before rebuilding the context; it does not silently skip a failed sequence and resume. A timeout has an ambiguous delivery outcome, not proof that no write occurred.
