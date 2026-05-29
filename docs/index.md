---
layout: home

hero:
  name: SINT Protocol
  text: Governance and Safety Control Plane for Physical AI
  tagline: Delegated authority, runtime enforcement, and evidence for actions with real-world consequence.
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
  - title: Runtime Safety Enforcement
    details: Every request is validated, tiered, approved when required, and fail-closed under revocation or disconnect.
  - title: Industrial Interoperability
    details: Bridge profiles for MCP, A2A, ROS 2, MQTT/Sparkplug, OPC UA, Open-RMF, and gRPC.
  - title: Auditability by Default
    details: Evidence ledger records decisions and outcomes with tamper-evident hash chaining and proof routes.
---

## Developer Quick Links

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
- Community launch runbook: [Discord Launch](./community/discord-launch-runbook.md)
- AAIF RFC-001 submission packet: [Community/AAIF Packet](./community/aaif-rfc001-submission-packet.md)
- Discord launch kit: [Community/Discord Launch Kit](./community/discord-launch-kit.md)
- Good-first-issues board: [Community/Starter Board](./community/good-first-issues-board.md)
- Collaboration reply playbook: [Community/Replies](./community/open-source-collaboration-replies.md)
- Physical AI runtime safety working group: [Community/Working Group](./community/physical-ai-runtime-safety-working-group.md)
- OWASP Agentic Landscape submission packet: [Community/OWASP Packet](./community/owasp-agentic-landscape-submission.md)
- EU AI Act mapping: [Compliance/EU AI Act](./compliance/eu-ai-act-mapping.md)
- ISO 13482 alignment: [Compliance/ISO 13482](./compliance/iso-13482-alignment.md)
- Formal threat model: [Security/Formal Threat Model](./security/formal-threat-model.md)
- MITRE ATLAS candidate mappings: [Security/MITRE ATLAS](./security/mitre-atlas-agent-technique-mappings.md)
- NIST submission bundle report: [Report](./reports/nist-submission-bundle.md)
- Latest security bulletin: [May 2026](./security-bulletins/2026-05.md)

## Documentation Scope

This site is the canonical repo-backed docs surface for `docs.sint.gg`. It is
generated from the `/docs` directory in this repository and deployed by GitHub
Actions.
