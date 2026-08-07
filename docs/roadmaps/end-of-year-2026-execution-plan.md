# End-of-Year 2026 Execution Plan

This is the working plan for what SINT should have shipped or proven by
December 2026.

It is intentionally narrower than the long-range 2026–2029 vision. The goal
here is to turn the current protocol surface into something externally legible,
production-minded, and collaboration-ready.

## End-of-Year Outcomes

By the end of 2026, SINT should be able to show:

1. a production-ready reference gateway path
2. public release and evidence gates that are repeatable
3. named external adopters or pilots beyond the core co-design cluster
4. sustained independent maintainership evidence
5. a cleaner protocol story across docs, repo, and public site

## Next 30 Days

The immediate order matters more than the total number of open ideas.

For the next 30 days, prioritize:

1. evidence and trust gaps that directly affect adoption credibility
2. external contributor retention and maintainer-signal compounding
3. Factory Action Pack Sprint 1 as the next protocol-standard upgrade
4. one shared external artifact from an existing collaborator lane
5. public site sync after the shipped story improves

In practice, that means:

- close the remaining OpenSSF evidence work now that the project profile is
  published
- convert the bug bounty planning contribution into a repeatable security lane
- move from the factory-control standard pack into the simulation-first demo
  lane and adapter stubs
- avoid broad new workstreams that do not improve trust, production evidence,
  or outside signal

## Q2 2026 — Tighten The Core

### Finish and Merge

- production hardening changes already underway
- AAIF evidence dossier and release gate workflow
- OpenSSF gap tracker and dependency review baseline
- maintainer scorecard workflow
- external contributor onboarding path
- robotics collaboration fixtures and guides

### Ship the Public Story

- refresh `docs/protocol.md` as the concise protocol page
- expand `docs/roadmap.md` into a real execution roadmap
- sync README, docs site, and main-site copy around the same story

## Q3 2026 — Prove The Reference Path

### Gateway and Security

- run the reference gateway with durable stores as the default production slice
- close the highest-priority OpenSSF and dependency-review gaps
- keep release gates green on every public protocol artifact lane

### External Trust Signals

- land at least one meaningful external contributor cycle beyond docs-only churn
- start the 90-day clock for an independent maintainer with real merge activity
- turn at least one collaborator fixture into a shared issue, draft adapter, or
  small PR with an external project

### Integration Focus

The strongest Q3 collaboration lanes are:

- Open-RMF handoff receipts
- MoveIt execution boundary
- Nav2 navigation boundary
- PX4 offboard boundary
- solar field robot motion boundary

### Factory Control Upgrade

Q3 should also start the factory-control track explicitly.

The thesis is that AI-generated factory plans are getting easier to produce,
while safe execution remains fragmented across simulation tools, PLC stacks,
robot vendors, approval workflows, and audit systems.

The goal for SINT is not to become another industrial design copilot. The goal
is to become the control layer between generated industrial intent and real
execution.

Planned sprint sequence:

- Sprint 1: factory intent, cell graph, robot action, simulation receipt, and
  industrial policy standard pack
- Sprint 2: simulation-first factory demo with refusal, approval, and receipt
  chain
- Sprint 3: industrial adapter and simulator pack for multi-vendor execution

Reference plan:

- [Factory Action Pack Upgrade Sprints](./factory-action-pack-upgrade-sprints.md)

## Q4 2026 — Package It For Reuse

### Protocol Surface

- cut a cleaner release candidate path for the reference gateway and SDKs
- keep protocol, conformance, and deployment docs in sync
- publish deployment and adapter examples that are small enough to copy
- keep the factory-control story tied to shipped control surfaces, not vague
  industrial ambition

### Ecosystem and Governance

- gather 2-3 named independent adopter or pilot signals if possible
- keep the maintainer scorecard current with a full quarter of evidence
- prepare the AAIF resubmission packet from shipped evidence only

### Main-Site Expectations

By Q4, `sint.gg/protocol` and `sint.gg/roadmap` should describe:

- what SINT already ships
- what is being hardened right now
- what will be finished by year-end
- where collaborators can plug in
- how SINT fits between AI-generated factory plans and real industrial execution

## What Not To Do

Do not confuse breadth with progress.

If a task adds a shiny new lane but does not improve:

- production readiness
- evidence quality
- external collaboration
- security posture
- maintainership credibility

it should not outrank the execution work above.

## Scorecard For December 2026

Use this simple year-end check:

- reference gateway path is documented and reproducible
- release gate and evidence dossier are part of normal workflow
- OpenSSF gaps are materially reduced
- at least one external project has engaged on a concrete fixture or adapter
- public roadmap and protocol pages no longer read like placeholders
- the factory-control upgrade track is legible as a real execution plan
