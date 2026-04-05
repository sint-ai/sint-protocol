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
      text: Protocol Spec v0.2
      link: /SINT_v0.2_SPEC
    - theme: alt
      text: Roadmap
      link: /roadmap

features:
  - title: Runtime Safety Enforcement
    details: Every request is validated, tiered, approved when required, and fail-closed under revocation or disconnect.
  - title: Industrial Interoperability
    details: Bridge profiles for MCP, A2A, ROS 2, MQTT/Sparkplug, OPC UA, Open-RMF, and gRPC.
  - title: Auditability by Default
    details: Evidence ledger records decisions and outcomes with tamper-evident hash chaining and proof routes.
---

## Developer Quick Links

- Gateway API docs: `/v1/docs`
- Local docs dev server: `pnpm run docs:dev`
- Build static docs site: `pnpm run docs:build`
- Core onboarding: [Getting Started](./getting-started.md)
- Integration examples: [Tutorials](./tutorials/hello-world-agent.md)
- Community launch runbook: [Discord Launch](./community/discord-launch-runbook.md)
- Latest security bulletin: [April 2026](./security-bulletins/2026-04.md)

## Documentation Scope

This site is the canonical public docs surface for `docs.sint.gg`. It is generated from the `/docs` directory in this repository and deployed by GitHub Actions.
