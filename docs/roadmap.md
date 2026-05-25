# SINT Roadmap

This is the active public roadmap for the protocol repo.

The short version: SINT is moving from a broad reference stack into a
production-ready protocol surface with sharper release gates, clearer evidence,
and more credible external collaboration.

## What Landed Recently

The current repo already includes:

- production hardening guides and release gates
- approval streaming and durable deployment paths
- AAIF evidence and maintainer workflows
- OpenSSF gap tracking and dependency review artifacts
- collaborator-facing physical AI fixtures for Open-RMF, MoveIt, Nav2, PX4,
  LeRobot, and solar field operations
- public onboarding and contribution docs for external collaborators
- one real external security-readiness contribution cycle through bug bounty
  planning and review

## Current Priority Order

As of May 2026, the repo should optimize for this order:

1. close the trust and evidence gaps that block serious adoption
2. turn external contributor signal into sustained maintainer signal
3. ship Sprint 1 of the Factory Action Pack as a control standard, not a
   marketing promise
4. convert one collaborator lane into a shared external artifact or adapter
5. refresh public site copy only after the shipped story is sharper

### Priority 1. Trust And Evidence

These items matter most because they improve submission quality, production
credibility, and external trust at the same time.

- completed issue [#192](https://github.com/sint-ai/sint-protocol/issues/192):
  `SECURITY.md` disclosure path and response SLA are verified and published
- completed issue [#193](https://github.com/sint-ai/sint-protocol/issues/193):
  signed production-slice validation artifact is published
- completed issue [#195](https://github.com/sint-ai/sint-protocol/issues/195):
  first tagged RC checklist evidence run is published
- completed issue [#194](https://github.com/sint-ai/sint-protocol/issues/194):
  dependency-review workflow and published audit artifact are in place
- active remediation issue [#209](https://github.com/sint-ai/sint-protocol/issues/209):
  remove remaining high findings in `fast-uri` dependency paths
- closed issue [#72](https://github.com/sint-ai/sint-protocol/issues/72) and
  merged PR
  [#196](https://github.com/sint-ai/sint-protocol/pull/196):
  keep the bug bounty launch path concrete and non-binding until funded

### Priority 2. External Maintainer Signal

The strongest recent message in the repo is not another self-authored plan. It
is outside participation.

That means the next maintainer priority is:

- keep Peter Xing's contribution cycle warm after PR
  [#196](https://github.com/sint-ai/sint-protocol/pull/196)
- look for one follow-up task that can become a second independent PR
- keep the maintainer scorecard and onboarding path current
- fix issue [#165](https://github.com/sint-ai/sint-protocol/issues/165) because
  it is another clean external-facing paper cut

### Priority 3. Factory Action Pack Sprint 1

This is the right product-expansion lane, but it should ship as a control
standard pack first.

Use:

- [Factory Action Pack Upgrade Sprints](./roadmaps/factory-action-pack-upgrade-sprints.md)
- issue [#202](https://github.com/sint-ai/sint-protocol/issues/202)

The immediate Sprint 1 target is:

- industrial action profile spec
- `FactoryIntent` schema
- `CellGraph` schema
- robot action schema
- simulation receipt schema
- industrial policy pack
- one refusal-first demo narrative

### Priority 4. External Artifact Conversion

The collaborator fixtures are valuable, but the next proof point is shared work
with another project, not just more internal fixture coverage.

Best conversion targets:

- Open-RMF handoff receipts
- Sunnybotics ROS 2 integration questions
- one industrial or factory-control design thread

### Priority 5. Public Story Sync

`sint.gg/protocol` and `sint.gg/roadmap` should be refreshed after the above
lanes move, because the best copy update is the one that reflects shipped
control surfaces and real outside signal.

## Through June 2026

The near-term goal is to finish tightening the core:

- [x] production hardening docs and verification flows
- [x] AAIF release gate and evidence dossier workflow
- [x] OpenSSF baseline tracker and dependency review lane
- [x] external contributor onboarding and scorecard workflows
- [x] robotics collaboration fixture pack
- [x] merge the current production-readiness branch
- [x] publish graph-first coordination upgrade roadmap lane
- [ ] keep docs, README, and public protocol copy aligned

## Q3 2026

Q3 is about proving that the protocol can survive outside a friendly demo
environment.

- [ ] reference gateway path documented as the default durable deployment slice
- [ ] conformance and certification artifacts kept green on every release lane
- [ ] at least one external collaborator thread turns into a shared fixture,
  adapter sketch, or PR
- [ ] independent maintainer evidence accumulates across a real multi-month
  window
- [ ] named adopter or pilot evidence improves beyond the immediate co-design
  cluster
- [ ] highest-priority OpenSSF and dependency-review gaps are materially reduced
- [x] Sprint 1 of the Factory Action Pack lands as a control-standard pack for
  prompt-generated industrial automation

## Q4 2026

Q4 is about packaging the protocol so the story is stronger than the pitch.

- [ ] public protocol page reflects what already ships, not just ambition
- [ ] roadmap page reflects a real through-December execution plan
- [ ] reference gateway, templates, and example integrations are clean enough to
  reuse
- [ ] 2-3 external deployment or pilot signals exist if the outreach lanes land
- [ ] AAIF resubmission packet can be assembled from shipped evidence only
- [ ] factory-control demo proves simulation-first execution and human approval
  before robot or PLC actions

## Through December 2026

For the fuller execution plan, use:

- [End-of-Year 2026 Execution Plan](./roadmaps/end-of-year-2026-execution-plan.md)
- [Factory Action Pack Upgrade Sprints](./roadmaps/factory-action-pack-upgrade-sprints.md)
- [Graph-First Coordination Upgrade 2026](./roadmaps/graph-first-coordination-upgrade-2026.md)

## Detailed Tracks

- [Protocol overview](./protocol.md)
- [Legacy phase plan](./roadmap-phases-legacy.md)
- [Ecosystem outreach 2026](./roadmaps/ecosystem-outreach-2026.md)
- [AAIF resubmission 2026](./roadmaps/aaif-resubmission-2026.md)
- [Factory Action Pack upgrade sprints](./roadmaps/factory-action-pack-upgrade-sprints.md)
- [Graph-first coordination upgrade 2026](./roadmaps/graph-first-coordination-upgrade-2026.md)
- [Humanoid robotics integrations 2026](./roadmaps/humanoid-robotics-integrations-2026.md)
- [Post-quantum crypto agility](./roadmaps/post-quantum-crypto-agility.md)

## What We Are Measuring

The repo should look better by the end of the year in five ways:

1. stronger production defaults
2. cleaner release and evidence discipline
3. better external collaborator signal
4. stronger maintainership credibility
5. less drift between repo docs, docs site, and public site copy
