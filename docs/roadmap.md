# SINT Protocol Roadmap

Status: canonical roadmap, updated 2026-09-22
Owner: maintainers (`CODEOWNERS`)
Cadence: reviewed at the start of each month; items move between horizons only here

This is the single source of truth for planned and unfinished work. It
consolidates the previous `docs/roadmap.md`, the root planning files that lived
beside it, the April 2026 session reports, and the detailed track documents
under `docs/roadmaps/`. Superseded planning documents are kept for history under
[`docs/archive/`](./archive/README.md) and are no longer maintained.

How to read it:

- **Now** is the next 30 days and is the only horizon with an order.
- **Next** is the rest of 2026.
- **Later** is 2027 and beyond, or blocked on an external party.
- Each item names the track document or GitHub issue that holds the detail.
- "Done" lists things earlier plans still showed as open, so nobody re-plans them.

## Where the repo stands

Shipped and verified on `main` as of 2026-09-22:

- Security core: Ed25519 capability tokens with attenuation-only delegation and
  cascade revocation, `PolicyGateway.intercept()` as the single decision point,
  T0-T3 tiers, M-of-N quorum, SHA-256 hash-chained evidence ledger, Constraint
  Language CL-1.0, emergency bypass, duress tokens, human-authority policy
  (structural checks), spatial-integrity and code-as-policy guards, the
  evidence-gated dynamic envelope with a real Ed25519 verifier and replay store.
- Bridges: MCP, ROS 2, MAVLink, IoT (MQTT/CoAP), MQTT Sparkplug, OPC UA,
  Open-RMF, gRPC, A2A, economy, swarm, Home Assistant, Matter, health (FHIR,
  differential privacy, caregiver delegation).
- Persistence: in-memory, PostgreSQL, Redis adapters; production-lite Docker
  Compose topology; gateway hardening guide.
- SDKs: TypeScript, Python, Go, Rust (client and edge authority evaluator).
- Conformance: 54 fixture-driven suites including OWASP ASI01-10, hardware
  safety handshake, kinetic envelope v0.1, factory action pack, and the
  SINT × DriftCore envelope-attestation adversarial fixture.
- Distribution: eleven core packages published to npm under the `@pshkv` scope
  at 0.1.0; `sint-mcp` and `sint-scan` as unscoped CLIs.

Test baseline: every workspace package passes (`pnpm run test`, 96 turbo
tasks). One timing-sensitive test in `autonomy-supervisor` can fail under
heavy parallel load and passes in isolation; it is tracked below.

## Now (through October 2026)

Ordered. These are the gaps most likely to be found by an outside reviewer,
because each one lets a claim stand in for a proof.

1. **Hardware safety permit cannot be self-asserted.** Today a request that
   carries its own `hardwareSafety` context wins over the configured
   `SafetyPermitPlugin`. The resolver must win when configured, and the
   resolver call needs a deadline that fails closed for T2/T3.
   Track: [hardware safety controller integration](./roadmaps/hardware-safety-controller-integration.md).
2. **Human approvals become cryptographic.** Approval-queue resolutions and the
   `/v1/approvals` route identify approvers by a string. Ship
   `HumanProofVerifierPlugin` with Ed25519-signed approvals bound to the
   request id, plus the authority fixture pack.
   Track: [human-agent authority](./roadmaps/human-agent-authority-2026.md) Y1, Y8.
3. **Verifiable-compute proof fails closed.** With no verifier configured the
   gateway records `verifiable.compute.verified` for any schema-valid strings.
   Require a verifier whenever proof is mandatory.
4. **Every declared physical constraint is enforced or removed.** Torque, jerk,
   angular velocity, and contact-force thresholds exist in the token schema but
   are never checked. Direct gateway calls that carry velocity in nested params
   (for example `params.linear.x`) are not compared against limits unless the
   bridge populates `physicalContext`.
5. **Dynamic-envelope failure demotes by default for industrial profiles.**
   `dynamicEnvelopeFailurePolicy` now exists; make `fallback` the default for
   `warehouse-amr` and `industrial-cell` deployments.
   Track: [envelope attestation profile v0.1](./specs/physical-envelope-attestation-profile-v0.1.md).
6. **Consolidate the open feature branches before adding layers.** PRs
   [#250](https://github.com/sint-ai/sint-protocol/pull/250),
   [#251](https://github.com/sint-ai/sint-protocol/pull/251) and
   [#255](https://github.com/sint-ai/sint-protocol/pull/255) introduce
   overlapping deployment-evidence, execution-broker and predictive-safety
   types that are drifting from `main`. Merge or close each one.
7. **Reconcile versions and publish everything public.** Git tags reach
   `v0.2.6` while every package is still `0.1.0` and `CHANGELOG.md` stops at
   0.1.0. Bump, add release notes, and extend `npm-publish.yml` to the public
   packages it skips (`bridge-homeassistant`, `bridge-matter`, `bridge-health`,
   `bridge-mqtt`, `sintctl`, `gateway-server`, `persistence`). Add a PyPI and a
   crates.io lane for the SDKs.
8. **DriftCore fixture follow-through.** Land
   [#257](https://github.com/sint-ai/sint-protocol/pull/257) and
   [#256](https://github.com/sint-ai/sint-protocol/pull/256), get a DriftCore
   runner against the same fixture, and settle the three open questions in the
   profile document.
9. **Fix the flaky recovery-budget test** in
   `packages/autonomy-supervisor/__tests__/conformance.autonomy.test.ts`
   (100 ms recovery budgets under parallel load).

## Next (Q4 2026)

### Reference deployment is fail-closed out of the box

- Wire `dynamicEnvelope`, `safetyPermit`, `circuitBreaker` and
  `edgeControlPlane` in `apps/gateway-server` behind deployment profiles, with
  fail-closed defaults for industrial profiles.
- Seed `LedgerWriter` from the persisted ledger head on restart instead of the
  genesis hash.
- Add nonce and timestamp to signed-body auth and compare the authenticated key
  with `request.agentId`.
- Back the remaining in-memory stores with PostgreSQL: revocations, pending
  approvals, circuit state, edge dispatch nonces, and the new
  `EvidenceSequenceStore`.
- Carry `envelopeDigest` into the signed edge dispatch envelope and verify it in
  the edge runner; add hardware-reported limits to the effective-limit `min()`.
- Structured decision logging, an error taxonomy, and a troubleshooting guide
  (folded from the archived production roadmap).

### Post-quantum agility

- Gate 2: wire an ML-DSA-65 verifier behind the crypto-profile registry with
  test vectors. Gate 3: hybrid `hybrid-ed25519-mldsa65` issuance and validation.
  Gate 4: ledger `hashAlgorithm` agility.
  Track: [post-quantum crypto agility](./roadmaps/post-quantum-crypto-agility.md).

### Conformance and tooling

- Package the certification runner so an external party can run it and produce
  a machine-readable report; record the first external run.
- `sintctl` verification and export commands: `trace verify`,
  `authority verify`, `authority receipt export`.
- Add tests for `bridge-matter` (none today) and for the FHIR, HealthKit,
  differential-privacy and caregiver modules in `bridge-health`.
- Hardware safety Phase C fixtures: ROS 2 to PLC and OPC UA to PLC transitions,
  handshake benchmark section, staged-rollout runbook.
- PX4 encrypted-log lane tasks 3-5: bridge evidence-pointer field, fail-closed
  profile option, latency note.

### Adoption evidence

These are the AAIF resubmission gates. They cannot be closed by code.
Track: [AAIF resubmission 2026](./roadmaps/aaif-resubmission-2026.md).

- Two named independent production adopters recorded in
  [`docs/community/adopters.md`](./community/adopters.md).
- One independent maintainer with 90 days of merged work on the
  [scorecard](./community/independent-maintainer-scorecard.md).
- OpenSSF Best Practices badge started and gaps filed
  ([#191](https://github.com/sint-ai/sint-protocol/issues/191), overdue since
  2026-06-01).
- One collaborator lane turned into an external PR or adapter (Open-RMF,
  MoveIt, Nav2, PX4, LeRobot, DriftCore).
- Launch items that have been ready since June: Show HN
  ([#126](https://github.com/sint-ai/sint-protocol/issues/126)), OWASP landscape
  form ([#125](https://github.com/sint-ai/sint-protocol/issues/125)), AAIF
  RFC-001 email, MITRE ATLAS mappings
  ([#127](https://github.com/sint-ai/sint-protocol/issues/127)), monthly
  security bulletins ([#249](https://github.com/sint-ai/sint-protocol/issues/249),
  [#254](https://github.com/sint-ai/sint-protocol/issues/254)).

### Factory action pack, Sprint 3 remainder

Adapters `modbus`, `beckhoff-twincat`, `rockwell-factorytalk`; simulator
`emulate3d`; example cells inspection, palletizing, drone-robot hybrid. Exit
criterion: a collaborator plugs in a real vendor API.
Track: [factory action pack sprints](./roadmaps/factory-action-pack-upgrade-sprints.md),
[`sint-industrial/manifest.v1.json`](../sint-industrial/manifest.v1.json).

## Later (2027 and beyond, or blocked on partners)

### Vertical governance packs

Each is fully specified in its track document and has no code yet. They share
the deployment-envelope, trace-bundle and authority primitives that the Next
horizon builds, so they start after those land.

| Pack | Track | Scope |
| --- | --- | --- |
| Autonomous factory A1-A9 | [autonomous-factory-readiness-2026.md](./roadmaps/autonomous-factory-readiness-2026.md) | manufacturing execution envelope, CellGraph v2, DFM/CAM guard, inspection receipts, MES/SCADA profiles, supplier authority, part trace bundle, readiness scorecard |
| Humanoid governance H1-H8 | [humanoid-deployment-governance-2026.md](./roadmaps/humanoid-deployment-governance-2026.md) | humanoid execution envelope, VLA skill provenance, whole-body kinetic envelope, human factors, component manifest, teleop sessions, site readiness, incident bundle |
| Roadway edge R1-R8 | [roadway-edge-intelligence-2026.md](./roadmaps/roadway-edge-intelligence-2026.md) | roadway envelope, traffic-controller bridge, V2X receipts, vulnerable-road-user guard, incident bundle, municipal privacy plugin |
| Human-agent authority Y2-Y7 | [human-agent-authority-2026.md](./roadmaps/human-agent-authority-2026.md) | delegation-chain checks, contextual binding, privacy-preserving receipts, anti-Sybil quorum, spending authority, physical approval profiles |
| Deployment readiness base | [deployment-readiness-execution-plan-2026.md](./roadmaps/deployment-readiness-execution-plan-2026.md) | `DeploymentEnvelopeBase`, `TraceBundleBase`, the 18-issue breakdown across the four packs |
| Graph-first coordination | [graph-first-coordination-upgrade-2026.md](./roadmaps/graph-first-coordination-upgrade-2026.md) | coordination graph, session and settlement schemas, `/v1/coordination/graph` |
| Spatial missions P1-P2 | [spatial-mission-sprint-plan.md](./roadmaps/spatial-mission-sprint-plan.md) | corridor resolvers (GeoJSON, Open-RMF, Nav2, MAVLink fences), ROS 2 localization, multi-robot reservations, rescue templates |
| Mission authority (defense) | [mission-authority-120-day-plan.md](./roadmaps/mission-authority-120-day-plan.md) | hardware demo, HIL, independent security review, TPM/HSM, secure boot; company items are out of scope for this repo |

### Physical AI 2026-2029 remainder

From [PHYSICAL_AI_GOVERNANCE_2026-2029.md](./roadmaps/PHYSICAL_AI_GOVERNANCE_2026-2029.md):
Avatar push notifications and explainability, SINT-nano tokens and
hierarchical edge trust proxy, SceneToken, `bridge-hri` with multimodal
consent, `bridge-city` with citizen consent tokens and a civic ledger,
`bridge-mobility`, `bridge-safety`, proxemics and vulnerability escalation,
accountability tokens. The README phase table for this plan was retired; this
list is the only status.

### Platform

- Formal verification of the policy engine invariants
  ([#81](https://github.com/sint-ai/sint-protocol/issues/81)).
- HSM and TEE-backed signing and attestation
  ([#74](https://github.com/sint-ai/sint-protocol/issues/74)).
- Multi-gateway federation ([#65](https://github.com/sint-ai/sint-protocol/issues/65)),
  plugin system for bridges ([#64](https://github.com/sint-ai/sint-protocol/issues/64)),
  agent reputation from audit history ([#66](https://github.com/sint-ai/sint-protocol/issues/66)).
- Helm chart, Grafana dashboards, SSO/RBAC, SLA tooling
  ([#76](https://github.com/sint-ai/sint-protocol/issues/76),
  [#79](https://github.com/sint-ai/sint-protocol/issues/79),
  [#80](https://github.com/sint-ai/sint-protocol/issues/80)).
- Load-test suite at 10K decisions/s and sub-millisecond p99
  ([#75](https://github.com/sint-ai/sint-protocol/issues/75),
  [#77](https://github.com/sint-ai/sint-protocol/issues/77)).
- Third-party security audit ([#71](https://github.com/sint-ai/sint-protocol/issues/71)),
  bug bounty once funded.
- Standards-track submission, academic program, robotics partner program
  ([#69](https://github.com/sint-ai/sint-protocol/issues/69),
  [#82](https://github.com/sint-ai/sint-protocol/issues/82),
  [#83](https://github.com/sint-ai/sint-protocol/issues/83)).
- Token economics: de-scoped to integer credits with no on-chain component
  ([#84](https://github.com/sint-ai/sint-protocol/issues/84),
  [#85](https://github.com/sint-ai/sint-protocol/issues/85),
  [#86](https://github.com/sint-ai/sint-protocol/issues/86) stay blocked until
  governance decides).
- Move the npm scope from the founder's personal `@pshkv` to an organization
  scope once one is reserved; docs and code now consistently use `@pshkv`.

## Done since the last roadmap

Items that earlier planning files still showed as open. Do not re-plan them.

| Item | Where it landed |
| --- | --- |
| PostgreSQL and Redis adapters | `packages/persistence-postgres`, `packages/persistence/src/redis-*` |
| Rust, Go, Python SDKs | `sdks/rust`, `sdks/go`, `sdks/python` |
| Constraint Language CL-1.0 | `packages/core/src/constraint-language.ts` |
| `sintctl registry` commands | `apps/sintctl/src/cli.ts` |
| Emergency bypass protocol | `packages/policy-gateway/src/emergency-bypass.ts` |
| Duress token | `packages/capability-tokens/src/duress-token.ts` |
| Differential-privacy ledger | `packages/bridge-health/src/differential-privacy.ts` |
| MQTT QoS to tier mapping | `packages/bridge-mqtt/src/qos-tier-mapper.ts` |
| `bridge-matter` | `packages/bridge-matter` |
| Δ_human occupancy escalation | `packages/policy-gateway/src/plugins/delta-human.ts` |
| WebSocket approvals | `/v1/approvals/ws` |
| Prometheus metrics | `/v1/metrics` |
| Docker Compose topologies | `docker/compose/` |
| Mission-authority contracts and Rust edge evaluator | `packages/core/src/types/mission-authority.ts`, `sdks/rust/sint-edge-authority` |
| Human-authority policy (structural) | `packages/policy-gateway/src/human-authority-policy.ts` |
| Spatial-integrity and code-as-policy guards | PR #248 |
| Evidence-gated envelope, failure policy, envelope binding | PR #257 |
| `fast-uri` remediation (#209) | PR #224 |
| Package scope mismatch (`@sint/` in docs vs `@pshkv/` in code) | fixed 2026-09-22 |

## Open GitHub issues not otherwise listed

[#4](https://github.com/sint-ai/sint-protocol/issues/4) (multi-agent
orchestration milestone) is superseded by the graph-first track.
[#110](https://github.com/sint-ai/sint-protocol/issues/110) (community
execution board) is covered by the adoption-evidence section.
[#130](https://github.com/sint-ai/sint-protocol/issues/130) (AAIF RFC-001
tracking) is covered by the AAIF track.
[#252](https://github.com/sint-ai/sint-protocol/issues/252) (software/MCP
kinetic-envelope profile) is a good first spec contribution and stays open.
Issues #64-#86 carry stale `Q3`/`Q4` labels from the April plan; their content
is mapped above.

## Track documents

Detailed plans live under `docs/roadmaps/`. They are inputs to this file, not
parallel roadmaps. Status here wins when they disagree.

| Track | Status |
| --- | --- |
| [End-of-year 2026 execution plan](./roadmaps/end-of-year-2026-execution-plan.md) | active; Q3 items folded into Now and Next |
| [AAIF resubmission 2026](./roadmaps/aaif-resubmission-2026.md) | active; gates unchanged |
| [Factory action pack sprints](./roadmaps/factory-action-pack-upgrade-sprints.md) | Sprint 3 in progress |
| [Deployment readiness execution plan](./roadmaps/deployment-readiness-execution-plan-2026.md) | proposed; P0 authority partly landed |
| [Autonomous factory readiness](./roadmaps/autonomous-factory-readiness-2026.md) | proposed |
| [Humanoid deployment governance](./roadmaps/humanoid-deployment-governance-2026.md) | proposed |
| [Roadway edge intelligence](./roadmaps/roadway-edge-intelligence-2026.md) | proposed |
| [Human-agent authority](./roadmaps/human-agent-authority-2026.md) | Y1 partly landed |
| [Graph-first coordination](./roadmaps/graph-first-coordination-upgrade-2026.md) | proposed |
| [Hardware safety controller integration](./roadmaps/hardware-safety-controller-integration.md) | Phase A partial |
| [Humanoid robotics integrations](./roadmaps/humanoid-robotics-integrations-2026.md) | packs shipped; external validation open |
| [Industrial humanoid shipyard sprint](./roadmaps/industrial-humanoid-shipyard-safety-sprint.md) | shipped; demo script and site adapters open |
| [Spatial mission sprint plan](./roadmaps/spatial-mission-sprint-plan.md) | P0 shipped; P1-P2 open |
| [Mission authority 120-day plan](./roadmaps/mission-authority-120-day-plan.md) | engineering items mostly shipped; hardware demo open |
| [Post-quantum crypto agility](./roadmaps/post-quantum-crypto-agility.md) | Gate 1 done; Gate 2 started |
| [Physical AI governance 2026-2029](./roadmaps/PHYSICAL_AI_GOVERNANCE_2026-2029.md) | phases 1, 2, 5 shipped; rest Later |
| [SINT × DriftCore collaboration](https://github.com/sint-ai/sint-protocol/pull/256) | Phase 2 fixture pack delivered in PR #257 |

Archived and no longer maintained: the April 2026 session reports, the
production and next-priorities roadmaps, the legacy five-phase plan, the
ecosystem outreach plan whose dates have passed, and the tokenomics draft. See
[`docs/archive/README.md`](./archive/README.md).
