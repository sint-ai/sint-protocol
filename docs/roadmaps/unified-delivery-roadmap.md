# SINT Unified Delivery Roadmap

**Status:** active execution plan  
**Updated:** 2026-09-21  
**Supersedes for prioritization:** feature-first ordering in legacy phase and
session-status documents. Those documents remain historical evidence, not the
current execution queue.

## Operating decision

SINT has more proposed surfaces than it can credibly support at once. The
single delivery sequence is therefore:

1. ship and prove the core production slice;
2. complete the data-to-physical-action trust chain for the factory/VLA lane;
3. convert completed internal adapters and fixtures into independent evidence;
4. expand one adjacent vertical only after the prior release gate is green.

No new bridge, city, health, consumer, or protocol track is a production claim
until it has a typed build, conformance coverage, a supported deployment
contract, and an operator-facing failure path.

## Consolidated status

| Workstream | Current evidence-backed state | Remaining exit criteria | Priority |
| --- | --- | --- | --- |
| Core production slice | Build, token, policy, persistence, ledger, gateway, production docs, and readiness work exist. | Fresh CI on `main`, repeatable E2E release run, schema migration/rollback rehearsal, named supported topology. | P0 |
| Release / supply-chain evidence | Release and dependency-review artifacts exist. | Resolve active dependency findings, maintain clean release evidence, publish only verified claims. | P0 |
| Factory Action Pack | Sprint 1 is shipped; simulation-first work and industrial pack have substantial shipped artifacts. | Run the end-to-end demo against a supported simulator and document the exact supported adapter matrix. | P1 |
| VLA / Axonnic data governance | VLA/OpenPI action governance exists; demonstration manifest and promotion validator are implemented. | Bind lineage/promotion authority in token + gateway, emit ledger events, add E2E conformance, dashboard and guarded pilot. | P1 |
| Spatial mission authorization | Token envelope is implemented; corridor and bridge context are partial. | GeoJSON/map resolvers, ROS2 odometry/TF context, multi-robot coordination fixtures. | P2 |
| Humanoid / hardware safety | Profile, fixture, bridge, and evidence scaffolding are shipped. | Independent simulator/vendor validation, controller contracts, safety-controller latency tests. | P2 |
| Post-quantum agility | Token metadata and fail-closed handling are implemented. | PQ verifier, hybrid issuance, ledger hash migration, transport hardening. | P2 |
| Consumer / health / Matter | Code exists but older phase reports conflict and some packages declare prototype build/typecheck behavior. | Reconcile status by passing typed build/tests; no production claim until the prototype exemptions are removed. | P3 |
| HRI, edge/nano, smart-city, roadway, graph coordination | Valuable proposed tracks, not release-gated work. | A funded or partnered use case plus a scoped design and conformance plan. | Deferred |
| AAIF / external validation | Evidence plan and contributor workflows exist. | Independent adopters, sustained independent maintainer activity, external artifacts, and OpenSSF gap closure. | Ongoing, external |

## Executable sequence

### Release 0.1 — prove the supported core

- Run clean install/build/typecheck/test/docs validation and record the output.
- Keep only the gateway/interceptor + Postgres/ledger path in the supported
  deployment statement.
- Eliminate prototype exemptions from any package claimed in that release.
- Rehearse schema bootstrap, upgrade, and rollback with a durable store.

**Done when:** a new operator can reproduce token issue → intercept → durable
evidence → revocation from the public documentation, and CI proves it.

### Release 0.2 — governed factory and VLA data path

- Bind approved demonstration dataset digest, training recipe, candidate, and
  rollback checkpoint into the existing runtime/capability constraints.
- Add gateway denial codes and append-only events for dataset admission,
  promotion, rollback, and consent-revocation eligibility.
- Make the OpenPI action chunk flow consume that authority before the execution
  broker dispatches.
- Ship one simulator-only factory/dexterous-cell demo with refusal, approval,
  safe-stop, and evidence export.

**Done when:** changing a demonstration, dataset, model, action space,
calibration, simulation receipt, or world snapshot fails closed at the
appropriate boundary.

### Release 0.3 — observable, externally testable reference deployment

- Add operator views for decisions, safe stops, lineage, approval latency, and
  intervention rate.
- Publish exact supported adapter and simulator versions with an integration
  test matrix.
- Convert one external collaboration into a reviewable fixture, adapter, or PR.

**Done when:** an independent integrator can deploy, reproduce a conformance
failure, and diagnose it from the documented evidence trail.

### After 0.3 — select one expansion lane

Select only one based on a real partner and the reuse of the completed control
chain: spatial/multi-robot, humanoid hardware safety, or a consumer/health
prototype graduating to typed production support. The remaining proposals stay
backlog, not active sprint commitments.

## Source reconciliation

- [Production Roadmap](https://github.com/sint-ai/sint-protocol/blob/main/PRODUCTION_ROADMAP.md) and
  [Next Priorities](https://github.com/sint-ai/sint-protocol/blob/main/NEXT_PRIORITIES.md) define current ordering.
- [Factory Action Pack](./factory-action-pack-upgrade-sprints.md),
  [VLA Governance](../vla-governance.md), and the
  [Dexterous Automation plan](./axonnic-dexterous-automation-roadmap.md)
  define the active P1 build lane.
- [Implementation Status](../IMPLEMENTATION_STATUS.md), `EXECUTION_SUMMARY.md`,
  and `SESSION_FINAL_STATUS.md` contain useful history but stale completion
  percentages. They must not be used for release claims without current tests.
- The proposed roadway, city, HRI, edge/nano, graph, and long-horizon plans are
  intentionally not summed into a completion percentage.

## Current sprint checklist

- [x] Add privacy-preserving demonstration-manifest validation.
- [x] Add dataset-lineage and promotion preflight validation.
- [x] Register the package in the workspace lockfile.
- [x] Bind promotion authority into tokens and `PolicyGateway.intercept()`.
- [x] Add digest-only runtime-lineage ledger evidence and substitution conformance.
- [x] Add end-to-end broker conformance: substituted lineage never dispatches an adapter.
- [x] Add valid-path conformance: admitted demonstration → dataset → promotion → token → gateway, with a verified ledger chain.
- [x] Define dedicated digest-only admission/promotion/rollback/revocation event constructors.
- [x] Wire event constructors into the capture/training orchestration service.
- [x] Provide and verify the hash-chained EvidenceLedger adapter.
- [ ] Validate the orchestration service in a real guarded pilot.
- [ ] Run a clean full release gate and record any non-core prototype exemptions.
