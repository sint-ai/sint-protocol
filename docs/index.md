---
layout: home

hero:
  name: SINT Protocol
  text: Runtime Security and Governance for AI Agents
  tagline: Capability-token authorization, approval tiers, physical constraints, and evidence receipts for MCP, robotics, industrial automation, and physical AI.
  image:
    src: /sint-logo.svg
    alt: SINT Protocol
  actions:
    - theme: brand
      text: Quick Start
      link: /getting-started
    - theme: alt
      text: Interceptor Demo
      link: /guides/sint-pdp-interceptor-quickstart
    - theme: alt
      text: Protocol Spec v0.2
      link: /SINT_v0.2_SPEC

features:
  - title: Pre-Action Policy Gateway
    details: Every governed request is validated, tiered, approved when required, and refused fail-closed under revocation, missing signatures, or disconnect.
  - title: Physical and Industrial AI Coverage
    details: Bridge profiles and fixtures cover MCP, A2A, ROS 2, MAVLink, PX4, MQTT/Sparkplug, OPC UA, Open-RMF, gRPC, shipyard humanoids, and simulator-backed industrial flows.
  - title: Evidence for Audits and Incident Response
    details: Hash-chained ledger records, proof receipts, shipyard JSONL evidence exports, OWASP ASI mappings, MITRE ATLAS candidate mappings, and release-gate artifacts make decisions verifiable.
---

## What Is SINT Protocol?

SINT Protocol is an open-source runtime governance layer for AI agents and
physical AI systems. It places a policy gateway before tool calls, robot
commands, industrial writes, payment-like actions, and regulated-data access so
developers can enforce scoped authority, approval routing, revocation, physical
limits, and tamper-evident audit evidence before execution.

## Developer Quick Links

- Latest shipped: [Industrial Humanoid Shipyard Safety Pack](./guides/industrial-humanoid-shipyard-safety-pack.md),
  [Shipyard Safety Sprint](./roadmaps/industrial-humanoid-shipyard-safety-sprint.md),
  [Agent Commerce Governance Profile](./specs/agent-commerce-governance-profile-v1.md)
- Protocol overview: [Protocol](./protocol.md)
- Active roadmap: [Roadmap](./roadmap.md)
- Gateway API docs: `/v1/docs`
- Local docs dev server: `pnpm run docs:dev`
- Build static docs site: `pnpm run docs:build`
- Core onboarding: [Getting Started](./getting-started.md)
- Flagship interceptor demo: [SINT PDP Interceptor Quickstart](./guides/sint-pdp-interceptor-quickstart.md)
- Integration examples: [Tutorials](./tutorials/hello-world-agent.md)
- Standalone certification tool: [Guide](./guides/standalone-certification-tool.md)
- NIST submission playbook: [Guide](./guides/nist-submission-playbook.md)
- Mission Authority reference gateway: [Guide](./guides/mission-authority-reference-gateway.md)
- Regulated agent runtime quickstart: [Guide](./guides/regulated-agent-runtime-quickstart.md)
- Spatial integrity policy: [Guide](./guides/spatial-integrity-policy.md)
- Community launch runbook: [Discord Launch](./community/discord-launch-runbook.md)
- AAIF RFC-001 submission packet: [Community/AAIF Packet](./community/aaif-rfc001-submission-packet.md)
- Discord launch kit: [Community/Discord Launch Kit](./community/discord-launch-kit.md)
- Good-first-issues board: [Community/Starter Board](./community/good-first-issues-board.md)
- Collaboration reply playbook: [Community/Replies](./community/open-source-collaboration-replies.md)
- Physical AI runtime safety working group: [Community/Working Group](./community/physical-ai-runtime-safety-working-group.md)
- Industrial humanoid shipyard safety pack: [Guide](./guides/industrial-humanoid-shipyard-safety-pack.md)
- Industrial humanoid shipyard safety sprint: [Roadmap](./roadmaps/industrial-humanoid-shipyard-safety-sprint.md)
- Code-as-policy robot agent safety: [Guide](./guides/code-as-policy-robot-agent-safety.md)
- Shipyard humanoid evidence export sample: `docs/reports/shipyard-humanoid-evidence-export.jsonl`
- OWASP Agentic Landscape submission packet: [Community/OWASP Packet](./community/owasp-agentic-landscape-submission.md)
- EU AI Act mapping: [Compliance/EU AI Act](./compliance/eu-ai-act-mapping.md)
- ISO 13482 alignment: [Compliance/ISO 13482](./compliance/iso-13482-alignment.md)
- Formal threat model: [Security/Formal Threat Model](./security/formal-threat-model.md)
- MITRE ATLAS candidate mappings: [Security/MITRE ATLAS](./security/mitre-atlas-agent-technique-mappings.md)
- Agent commerce governance profile: [Spec](./specs/agent-commerce-governance-profile-v1.md)
- Regulated agent runtime profile: [Spec](./specs/regulated-agent-runtime-profile-v1.md)
- A2A Agent Card external evidence: [Spec](./specs/a2a-agent-card-external-evidence.md)
- Persona AI shipyard safety brief: [Community Brief](./community/persona-ai-shipyard-safety-brief.md)
- NIST submission bundle report: [Report](./reports/nist-submission-bundle.md)
- Latest security bulletin: [July 2026](./security-bulletins/2026-07.md)

## Documentation Scope

This site is the canonical repo-backed docs surface for `docs.sint.gg`. It is
generated from the `/docs` directory in this repository and deployed by GitHub
Actions.
