# SINT Protocol — One Pager

## Positioning

SINT Protocol is an open protocol and reference stack for governing AI agents that can take real actions in the world.

It sits between agent frameworks and execution surfaces such as MCP tools, robotics interfaces, industrial control systems, and approval workflows. SINT defines how authority is issued, how runtime decisions are enforced, and how evidence is recorded.

## The Problem

Agent systems are moving from chat into execution:

- calling MCP tools
- operating robots and drones
- writing to OT and industrial systems
- triggering business actions that are costly or irreversible

The gap is not intelligence. The gap is control.

Developers still need a standard way to answer four questions:

1. Who is allowed to do this?
2. Under which constraints?
3. When does a human need to approve?
4. How do we prove what happened later?

Most teams solve these questions with app-specific middleware, scattered policy code, and best-effort logs. That does not scale across frameworks, environments, or consequence levels.

## What SINT Is

SINT turns execution governance into protocol primitives:

- **Capability tokens** for scoped authority, expiry, delegation, and revocation
- **Policy gateway** as the single interception point for protected actions
- **Approval tiers** that map consequence severity to autonomy or human review
- **Evidence ledger** with append-only, tamper-evident, hash-chained records
- **Bridge layer** for MCP, A2A, ROS 2, MAVLink, OPC UA, MQTT/Sparkplug, Open-RMF, and gRPC

## Where It Fits

SINT complements existing systems instead of replacing them.

| Layer | What it does | What SINT adds |
|---|---|---|
| MCP / A2A | Tool calling and agent-to-agent communication | Runtime authorization, tiering, audit, revocation |
| Robotics middleware | Device and control transport | Consequence-aware governance and evidence |
| Application code | Business logic | Reusable execution control plane |

## Why Developers Care

| Concern | SINT answer |
|---|---|
| Permissioning | Scoped capability tokens with attenuation-only delegation |
| Safety constraints | Token-native bounds like velocity, force, and geofence |
| Human oversight | Graduated approval tiers from autonomous to operator-reviewed |
| Auditability | Hash-chained evidence ledger and pluggable proof receipts |
| Interoperability | One governance model across agent, robotics, and industrial bridges |

## Current Project Surface

- Apache-2.0 licensed
- TypeScript reference implementation
- Public docs at [docs.sint.gg](https://docs.sint.gg)
- Protocol spec and SIP process published in-repo
- Example flows for hello-world, warehouse AMR, and industrial-cell scenarios
- Gateway, dashboard, CLI, SDK, conformance tests, and bridge packages in one monorepo

## Best First Steps

- Read the repo overview: [README.md](./README.md)
- Run the quick start: [docs/getting-started.md](./docs/getting-started.md)
- Try the first example: [examples/hello-world/README.md](./examples/hello-world/README.md)
- Review the protocol surface: [docs/SINT_v0.2_SPEC.md](./docs/SINT_v0.2_SPEC.md)
- Join design discussion: [GitHub Discussions](https://github.com/sint-ai/sint-protocol/discussions)

## Who Should Pay Attention

- developers building MCP servers or agent platforms
- robotics teams that need permissioning and operator escalation
- platform and security engineers responsible for agent execution control
- researchers and standards contributors working on trustworthy agent infrastructure

## Bottom Line

SINT is trying to become the open execution-governance layer for AI systems that can do more than talk.

If an agent can cause real-world consequences, SINT is the layer that should decide whether the action is allowed, whether a human must approve it, and what evidence remains afterward.
