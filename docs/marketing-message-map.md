# SINT Protocol Messaging Map

Use this document as the canonical source for public-facing positioning across README copy, docs, social posts, talks, and outreach.

## Core positioning

**Short version**

SINT Protocol is an open protocol and reference stack for governing AI agent execution when actions have real-world consequences.

**One-sentence version**

SINT gives developers a control plane for capability tokens, policy enforcement, approval routing, and tamper-evident evidence across MCP, robotics, and industrial execution surfaces.

**What SINT is not**

- not a replacement for MCP, A2A, ROS 2, or industrial protocols
- not just another agent framework
- not primarily a content, marketing, or avatar platform in this repository context

## Ideal audience

- developers building MCP servers, agent runtimes, and tool gateways
- robotics teams that need authorization, escalation, and auditability
- platform and security engineers responsible for agent execution control
- researchers and standards contributors working on trustworthy agent infrastructure

## Problem statement

AI agents can now do more than generate text. They can call tools, execute code, operate robots, and write to safety-critical systems.

The missing layer is execution governance:

1. Who is allowed to act?
2. Under which constraints?
3. When does a human need to approve?
4. How do you prove what happened afterward?

## Value pillars

### 1. Scoped authority

Capability tokens define which agent can perform which action on which resource, under which constraints, for how long.

### 2. Runtime enforcement

Every protected action passes through a single policy choke point that can allow, deny, or escalate.

### 3. Human oversight

Approval tiers map consequence severity to autonomy or human review.

### 4. Evidence

Every decision is captured in a tamper-evident, hash-chained ledger for audit and forensics.

### 5. Interoperability

SINT works across execution surfaces such as MCP, A2A, ROS 2, MAVLink, MQTT/Sparkplug, OPC UA, Open-RMF, and gRPC.

## Proof points to emphasize

- Apache-2.0 licensed
- public docs at [docs.sint.gg](https://docs.sint.gg)
- runnable quick start and examples
- protocol spec, SIP process, and implementation docs published in-repo
- bridge integrations, gateway, dashboard, CLI, SDK, and conformance tooling all live in one public monorepo

## Preferred phrasing

- "execution governance"
- "policy gateway"
- "capability tokens"
- "approval tiers"
- "tamper-evident evidence ledger"
- "open protocol and reference stack"
- "real-world consequences"

## Avoid

- brittle package or test counts unless generated in the same workflow that publishes them
- positioning SINT as a generic multi-agent orchestration framework
- mixing the protocol story with unrelated internal ecosystem products
- hype-heavy lines that force the reader to infer the actual developer workflow

## Canonical links

- GitHub: https://github.com/sint-ai/sint-protocol
- Docs: https://docs.sint.gg
- Quick start: https://docs.sint.gg/getting-started
- Spec: https://docs.sint.gg/SINT_v0.2_SPEC
- Discussions: https://github.com/sint-ai/sint-protocol/discussions
