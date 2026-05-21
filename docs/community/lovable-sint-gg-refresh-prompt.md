# Lovable Prompt — Refresh `sint.gg/protocol` and `sint.gg/roadmap`

Use this prompt in Lovable to update the main site pages so they match the
current repo and docs story.

## Prompt

```text
Update two existing pages on sint.gg:

1. /protocol
2. /roadmap

Goal:
Make both pages feel like a real open-source protocol project with a production-minded execution plan, not placeholder marketing copy.

Voice:
- technical
- warm
- direct
- zero hype
- no vague “AI future” language
- no cheesy startup slogans
- no em dashes

Important constraints:
- Keep the design consistent with the existing sint.gg visual system.
- Do not redesign the whole site.
- Improve only these two pages.
- The pages must feel like they belong to an open source protocol project.
- Do not invent new claims, customers, or metrics.
- Avoid hardcoded counts unless they are explicitly present in the source material.
- Use actual shipped surfaces and actual roadmap themes.

Source of truth for content:
- README.md
- docs/protocol.md
- docs/roadmap.md
- docs/roadmaps/end-of-year-2026-execution-plan.md
- docs/roadmaps/factory-action-pack-upgrade-sprints.md
- docs/community/website-sync-checklist.md
- docs/guides/gateway-production-hardening.md
- docs/guides/production-slice-verification.md
- docs/community/aaif-evidence-dossier.md
- docs/community/openssf-gap-tracker.md
- docs/community/robotics-collaboration-outreach-schedule.md
- docs/community/sunnybotics-collaboration-brief.md

Page 1: /protocol

Intent:
This page should explain what SINT actually is today.

Structure:

Hero:
- H1: SINT Protocol
- Supporting line: The governance layer between agent intent and physical execution.
- One short paragraph explaining that SINT sits between an agent decision and the system that can actually execute it.
- Primary CTA: View Docs
- Secondary CTA: View Roadmap

Section: The core loop
- Show this sequence in a compact visual or code-style block:
  request -> capability token -> PolicyGateway.intercept() -> allow | deny | escalate -> EvidenceLedger receipt
- Add one sentence explaining why this boundary matters.

Section: What ships now
- Use 4 to 6 concise blocks:
  - capability tokens
  - Policy Gateway
  - evidence ledger
  - T0 to T3 approval tiers
  - fail-closed production path
  - conformance and release gates

Section: Integration surfaces
- Show that SINT is already shaped for real integration boundaries:
  - MCP and A2A
  - ROS 2 and Open-RMF
  - MAVLink and industrial protocols
  - Matter and Home Assistant
  - health and consent-governed data access
- Make this feel concrete, not exhaustive.

Section: Physical AI collaboration lanes
- Add a compact strip or grid mentioning the collaboration artifact lanes that already exist:
  - Open-RMF
  - MoveIt
  - Nav2
  - PX4
  - LeRobot
  - solar field operations
- One sentence: these are fixtures and adapter questions designed to let collaborators critique the policy boundary.

Section: Production direction
- Explain that the current focus is not breadth for its own sake.
- Emphasize:
  - stronger production defaults
  - clearer evidence
  - cleaner release gates
  - external collaboration
  - maintainership credibility
- Add one compact note that SINT is also expanding toward prompt-generated
  factory control, where simulation proof and approval sit between generated
  industrial plans and execution.

Section: Footer CTA
- Invite readers to explore docs, roadmap, and GitHub.
- Keep it technical and low-pressure.

Design notes for /protocol:
- No giant marketing cards.
- No fake dashboards.
- No decorative buzzword blocks.
- Keep sections scan-friendly.
- Make the protocol loop and the current shipped surface the center of gravity.

Page 2: /roadmap

Intent:
This page needs a real plan through the end of 2026.

Structure:

Hero:
- H1: Roadmap
- Supporting line: The execution plan for turning SINT into a production-ready protocol surface.
- One short paragraph that explains the roadmap is focused on production readiness, evidence quality, and external adoption.

Section: What landed recently
- Summarize the recent work as shipped surfaces, not vague intentions:
  - production hardening guides
  - release gates and evidence dossier workflow
  - OpenSSF gap tracking
  - external contributor onboarding
  - robotics collaboration fixtures

Section: Through June 2026
- Use a short checklist or milestone layout.
- Emphasize:
  - merge production-readiness hardening
  - keep docs and public copy aligned
  - maintain release discipline

Section: Q3 2026
- Focus on proving the reference path:
  - durable reference gateway path
  - conformance lanes kept green
  - external collaborator threads become real artifacts
  - independent maintainer evidence accumulates
  - adopter signal improves

Section: Q4 2026
- Focus on packaging and credibility:
  - public protocol story reflects what ships
  - 2 to 3 meaningful deployment or pilot signals if outreach lands
  - evidence-backed AAIF resubmission packet
  - cleaner examples and templates
  - a factory-control upgrade track that reads like a real sprint sequence, not
    a hand-wavy future plan

Section: End-of-year scorecard
- Show 5 simple year-end checks:
  - stronger production defaults
  - stronger release and evidence discipline
  - better collaborator signal
  - stronger maintainership credibility
  - less drift between repo docs and website copy

Section: What the roadmap is not
- One short block saying the roadmap is not about piling on breadth without improving production readiness, evidence, security, or adoption.

Design notes for /roadmap:
- Avoid generic timeline filler.
- Make it feel like an engineering execution page.
- Keep the plan readable in one scroll on desktop.
- Leave visible hints of lower sections in the first viewport.

General implementation details:
- Improve on-screen hierarchy.
- Use restrained layout, crisp spacing, and high information density without clutter.
- Use real section headings, not slogan language.
- Keep text human and specific.
- Avoid purple-heavy or one-note palette drift.
- Do not create a landing-page style hero with unrelated imagery.

At the end, give me:
- a short summary of what changed on each page
- any content assumptions you had to make
```
