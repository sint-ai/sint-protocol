# SINT Unified Delivery Roadmap

**Status:** active execution plan  
**Updated:** 2026-11-04

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

The [one completion queue](#one-completion-queue) below is the only active list
of what is still open across the other roadmap files. It does not change the
public 25 of 28.

No new bridge, city, health, consumer, or protocol track is a production claim
until it has a typed build, conformance coverage, a supported deployment
contract, and an operator-facing failure path.

## Consolidated status

| Workstream | Current evidence-backed state | Remaining exit criteria | Priority |
| --- | --- | --- | --- |
| Core production slice | Build, token, policy, persistence, ledger, gateway, production docs, and readiness work exist. The schema migration and rollback rehearsal is recorded in `packages/persistence/__tests__/schema-migration-rollback-rehearsal.test.ts`. | Fresh CI on `main`, repeatable E2E release run, named supported topology. | P0 |
| Release / supply-chain evidence | Release and dependency-review artifacts exist. | Resolve active dependency findings, maintain clean release evidence, publish only verified claims. | P0 |
| Factory Action Pack | Sprint 1 is shipped; simulation-first work and industrial pack have substantial shipped artifacts. | Run the end-to-end demo against a supported simulator and document the exact supported adapter matrix. | P1 |
| VLA / Axonnic data governance | Token-bound lineage, digest-only provenance events and E2E conformance implement the reviewed VLA/OpenPI foundation. Unsupported signed enforcement contracts deny explicitly. | Guarded pilot, production model/transport integration and metrics dashboard. | P1 |
| Spatial mission authorization | Token envelope is implemented; corridor and bridge context are partial. | GeoJSON/map resolvers, ROS2 odometry/TF context, multi-robot coordination fixtures. | P2 |
| Humanoid / hardware safety | Profile, fixture, bridge, and evidence scaffolding are shipped. | Independent simulator/vendor validation, controller contracts, safety-controller latency tests. | P2 |
| Post-quantum agility | Token metadata and fail-closed handling are implemented. | PQ verifier, hybrid issuance, ledger hash migration, transport hardening. | P2 |
| Consumer / health / Matter | Code exists but older phase reports conflict and some packages declare prototype build/typecheck behavior. | Reconcile status by passing typed build/tests; no production claim until the prototype exemptions are removed. | P3 |
| HRI, edge/nano, smart-city, roadway, graph coordination | Valuable proposed tracks, not release-gated work. | A funded or partnered use case plus a scoped design and conformance plan. | Deferred |
| AAIF / external validation | Evidence plan, contributor workflows, the OpenSSF profile, and the `v0.3.0-rc1` release gate exist. | Named independent adopters, a 90-day independent maintainer, a recorded live gateway run, and a filled stage proposal. | Ongoing, external |

## Executable sequence

### Release 0.1 — prove the supported core

- Run clean install/build/typecheck/test/docs validation and record the output.
- Keep only the gateway/interceptor + Postgres/ledger path in the supported
  deployment statement.
- Eliminate prototype exemptions from any package claimed in that release.
- The migration 008 upgrade and rollback rehearsal is recorded in `packages/persistence/__tests__/schema-migration-rollback-rehearsal.test.ts`. It applies the real SQL files and keeps the token row.

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
- [x] Run the full build/typecheck/test/docs/fixture and explicit service gates; record non-core prototype exemptions in the [foundation release evidence](../reports/foundation-release-2026-10-24.md).

## One completion queue

This is the only active list of what is still open. Each count stays on its own page. None of them is added to the public 25 of 28 in [docs/roadmap.md](../roadmap.md).

A box is checked on its own page only when an artifact already in this repo proves it. A merged pull request is not an adopter, not a 90-day maintainer, and not a pilot.

### Public roadmap

Still 25 of 28. These three stay open:

- an independent maintainer with a real multi-month merge window
- a named adopter or pilot outside the co-design cluster
- two or three external deployment or pilot signals

### This page

Still 11 of 12. The open line is a real guarded pilot of the orchestration service. That pilot has not been run.

Release 0.1 records the schema migration and rollback rehearsal in `packages/persistence/__tests__/schema-migration-rollback-rehearsal.test.ts`. A renewal after `expiresAt` stops the active lease, and a second stop does not deliver the callback again, in `packages/policy-gateway/__tests__/continuous-effect-coordinator.test.ts`. An escalated approval that omits the simulation receipt is rejected before nonce consumption, and a dispatched execution receipt names that simulation receipt, in `packages/execution-broker/__tests__/execution-broker.test.ts`. A hardware E-stop blocks that dispatch even when the simulation receipt passes, in the same test. A ROS 2 cmd_vel linear tick at the token velocity bound is published, and a faster forward or reverse tick is not, in `packages/bridge-ros2/__tests__/runtime-shield.test.ts`. A faster forward or reverse yaw tick is not published, in the same test. A PLC speed setpoint at the token velocity bound is written, and a faster forward or reverse setpoint is not, in `packages/bridge-opcua/__tests__/runtime-shield.test.ts`. A T1 shadow request that names unsupported phenomena escalates for human review, in `packages/policy-gateway/__tests__/simulation-evidence-policy.test.ts`. A T1 shadow request whose world-snapshot uncertainty is greater than zero escalates for human review, in the same test. A T1 shadow request whose observed clearance is below the receipt's predicted clearance escalates for human review, in the same test. A T1 shadow request whose observed contact force exceeds the receipt's predicted force escalates for human review, in the same test. A T1 shadow request whose observed operational duration exceeds the receipt's predicted duration escalates for human review, in the same test. A T1 shadow request whose observed collisions exceed the receipt's predicted collisions escalates for human review, in the same test. A T1 shadow request whose observed safety-controller permit disagrees with the receipt's predicted controller motion permission escalates for human review, in the same test. A T1 shadow request whose published model calibration error exceeds its published confidence threshold escalates for human review, in the same test. An approved navigation stress case adds its sensor delay to the reaction time before braking, in `packages/conformance-tests/src/scene-aware-navigation-conformance.test.ts`. An approved navigation stress case adds its extra actor speed to a dynamic obstacle's reachability, in the same test. None of those recordings check one of the three public boxes.

### AAIF resubmission

Two lines on [the AAIF checklist](./aaif-resubmission-2026.md) are checked because the artifacts were already in the repo:

- the OpenSSF profile is published and every row in the gap tracker is done
- `v0.3.0-rc1` passed build, test, docs build, and conformance ([release-gate report](../reports/aaif-release-gate-2026-05-21.md), issue #207)

These stay open:

- two or more named independent production adopters
- one independent maintainer with 90 or more days of sustained merges
- a reference gateway that is built, released, and running from the public docs (a live run is not recorded)
- a filled proposal that separates co-design, interop, pilot, and production (the template exists; a submission does not)
- a filled proposal that asks for the stage the evidence supports (the rubric exists; a filled ask does not)

### Later repo slices, one behavior each

The migration rehearsal is recorded. A renewal after `expiresAt` and a single stop delivery are recorded in the coordinator test. Approval resolution is bound to the simulation receipt, and a dispatched execution receipt names that simulation receipt, in the execution-broker test. A hardware E-stop blocks that dispatch even when the simulation receipt passes. A ROS 2 cmd_vel linear tick at the token velocity bound is published, and a faster forward or reverse tick is not, in `packages/bridge-ros2/__tests__/runtime-shield.test.ts`. A faster forward or reverse yaw tick is not published, in the same test. A PLC speed setpoint at the token velocity bound is written, and a faster forward or reverse setpoint is not, in `packages/bridge-opcua/__tests__/runtime-shield.test.ts`. A T2 cmd_vel tick at the pre-simulated corridor velocity escalates, and a faster forward or reverse tick is denied, in `packages/policy-gateway/__tests__/simulation-evidence-policy.test.ts`. A T1 shadow request that names unsupported phenomena escalates for human review, in the same test. A T1 shadow request whose world-snapshot uncertainty is greater than zero escalates for human review, in the same test. A T1 shadow request whose observed clearance is below the receipt's predicted clearance escalates for human review, in the same test. A T1 shadow request whose observed contact force exceeds the receipt's predicted force escalates for human review, in the same test. A T1 shadow request whose observed operational duration exceeds the receipt's predicted duration escalates for human review, in the same test. A T1 shadow request whose observed collisions exceed the receipt's predicted collisions escalates for human review, in the same test. A T1 shadow request whose observed safety-controller permit disagrees with the receipt's predicted controller motion permission escalates for human review, in the same test. A T1 shadow request whose published model calibration error exceeds its published confidence threshold escalates for human review, in the same test. An approved navigation stress case adds its sensor delay to the reaction time before braking, in `packages/conformance-tests/src/scene-aware-navigation-conformance.test.ts`. An approved navigation stress case adds its extra actor speed to a dynamic obstacle's reachability, in the same test. An approved navigation stress case adds its extra localization error to the robot position bound, in the same test. An approved navigation stress case ages a dynamic obstacle's last update, in the same test. An approved navigation stress case adds its actuator lag to the stop corridor, in the same test. An approved navigation stress case reduces the minimum braking deceleration, in the same test. A T1 shadow request whose observed clearance is below the receipt's predicted clearance appends `simulation.execution.drift_detected`, in `packages/policy-gateway/__tests__/simulation-evidence-policy.test.ts`. A T1 shadow request whose observed contact force exceeds the receipt's predicted force appends `simulation.execution.drift_detected`, in the same test. A T1 shadow request whose observed operational duration exceeds the receipt's predicted duration appends `simulation.execution.drift_detected`, in the same test. A T1 shadow request whose observed collisions exceed the receipt's predicted collisions appends `simulation.execution.drift_detected`, in the same test. A T1 shadow request whose observed controller permit disagrees with the receipt's predicted controller outcome appends `simulation.execution.drift_detected`, in the same test. A receipt signed by a retired simulation signer key is rejected, in the same test. A selected T3 action whose receipt names only one model is rejected, a repeated model digest is rejected, and two different model digests still escalate, in the same test. A receipt whose image digest is missing or not in the trusted set is rejected, and an attested digest still passes, in the same test. An authenticated simulate call past a configured quota is rejected, and a health check or unauthenticated request does not consume that quota, in `apps/simulation-server/__tests__/server.test.ts`. A simulate request for a different tenant, or one that omits the tenant, is rejected, and the bound tenant still returns a receipt, in the same test. A mutual-TLS listener closes a handshake that presents no client certificate, in `apps/simulation-server/__tests__/mtls.test.ts`. A configured SPIFFE trust domain rejects a client certificate outside that domain, or one that omits the SPIFFE ID, and a matching SPIFFE ID still reaches the worker, in the same test. A simulation client stops calling the worker after its configured consecutive retryable failure limit, in `packages/predictive-safety-client/__tests__/http-effect-simulator.test.ts`. A simulation worker refuses startup when its active signer is listed as retired, and still accepts a different retired key, in `apps/simulation-server/__tests__/config.test.ts`. A simulation client reuses a signed receipt for the same effect plan, world digest, and model digest, and the next call does not reach the worker, in `packages/predictive-safety-client/__tests__/signed-cache.test.ts`. Next repo slices:

1. Add regional worker pools and bounded queues is still open on [that page](./predictive-safety-plane-2026.md). A simulation client reuses a signed receipt for the same effect plan, world digest, and model digest, and the next call does not reach the worker, in `packages/predictive-safety-client/__tests__/signed-cache.test.ts`. A simulation worker that refuses startup when its active signer is listed as retired, and still accepts a different retired key, is recorded in `apps/simulation-server/__tests__/config.test.ts`. A simulation client that stops calling the worker after its configured consecutive retryable failure limit is recorded in `packages/predictive-safety-client/__tests__/http-effect-simulator.test.ts`. A configured SPIFFE trust domain is recorded in `apps/simulation-server/__tests__/mtls.test.ts` and `apps/simulation-server/__tests__/config.test.ts`. A mutual-TLS listener that closes a handshake with no client certificate is recorded in `apps/simulation-server/__tests__/mtls.test.ts`. Tenant isolation is recorded in `apps/simulation-server/__tests__/server.test.ts`. A configured simulation request quota is recorded in `apps/simulation-server/__tests__/server.test.ts`. Image attestation is recorded in `packages/policy-gateway/__tests__/simulation-evidence-policy.test.ts`. Two independent models for selected T3 actions are recorded in `packages/policy-gateway/__tests__/simulation-evidence-policy.test.ts`. Signer-key rotation is recorded in `packages/policy-gateway/__tests__/simulation-evidence-policy.test.ts`. Redis-backed simulation receipt nonce state is recorded in `packages/persistence/__tests__/redis-simulation-receipt-nonce-store.test.ts`. Postgres-backed simulation receipt nonce state is recorded in `packages/persistence/__tests__/pg-simulation-receipt-nonce-store.test.ts`. Controller drift is recorded in `packages/policy-gateway/__tests__/simulation-evidence-policy.test.ts`. Clearance drift is recorded in the same test. Force drift is recorded in the same test. Duration drift is recorded in the same test. Collision drift is recorded in the same test. Weaker braking is recorded in `packages/conformance-tests/src/scene-aware-navigation-conformance.test.ts`. Actuator lag is recorded in the same test. Dropped messages are recorded in the same test. Localization error is recorded in the same test. Actor motion is recorded in the same test. Sensor delay is recorded in the same test and `packages/engine-effect-simulator/__tests__/seeded-navigation-distribution.test.ts`. Per-model calibration error and confidence thresholds are recorded in `packages/policy-gateway/__tests__/simulation-evidence-policy.test.ts`. Predicted versus observed controller outcomes is recorded in the same test. Predicted versus observed collisions is recorded in the same test. Predicted versus observed duration is recorded in the same test. Predicted versus observed contact force is recorded in the same test. Predicted versus observed clearance is recorded in the same test. One expansion lane stays waiting on a real partner. Home Assistant, Matter, and health stay outside the supported slice until their build, typecheck, and tests run. Skip gRPC until a design partner requires it. Skip the pilot-site canary until a pilot site exists.

### Held outside this repo

Do not check these from a code change:

- OATR production deploy, DNS, the well-known document, the maintainer ping, and the badge
- launch posts, Hacker News, Discord, and directory listings
- the OWASP form and its response
- bug-bounty vendor choice, reward budget, and a live announcement
- US defense legal, registration, and facility items
- an email to AAIF, a recorded reply, and an RFC reference in AAIF docs
- the legacy phase archive. Postgres and Redis are already the supported topology on the public roadmap. That archive is not a score.

### Lanes with no checkbox score

These stay lanes. They are not summed into a percent: the embodied-authorization whitepaper, the end-of-year 2026 plan, factory sprints, dexterous automation, consumer TV, deployment readiness, ecosystem outreach, graph coordination, hardware safety controllers, human–agent authority, humanoid governance, humanoid integrations, the shipyard sprint, the 120-day mission-authority plan, post-quantum agility, roadway edge intelligence, the spatial mission sprint, physical AI governance through 2029, and the DriftCore research proposal. DriftCore is a proposal for review. It is not a partnership.
