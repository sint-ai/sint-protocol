# SINT × DriftCore Physical-Envelope Research Roadmap

Status: proposal for public review  
Participants invited: SINT maintainers and
[@justingracie-defender](https://github.com/justingracie-defender)  
Initial scope: research and interoperability; no partnership or endorsement is
implied

## Purpose

SINT and [DriftCore OS](https://github.com/justingracie-defender/driftcore-os)
address the same boundary from complementary directions: an AI proposes an
action, but an enforcement layer decides whether that action may reach a tool or
physical system.

The most useful shared research question is narrower than comparing the two
projects as a whole:

> How can an authorization layer verify that a deployment-specific physical
> envelope exists, is enforced outside the agent's authority, remains valid for
> the observed operating conditions, and cannot be widened by the agent?

This roadmap turns that question into falsifiable artifacts. It intentionally
starts with specifications, attack cases, and fixtures before either project
adopts the other's runtime code.

## Complementary Starting Points

### SINT contributes

- Ed25519 capability tokens bound to subject, resource, action, expiry, and
  physical constraints
- attenuation-only delegation, revocation, T0-T3 approval tiers, and M-of-N
  approval
- `PolicyGateway.intercept()` as the single authorization decision point
- protocol bridges and a proof-carrying final execution boundary
- tamper-evident evidence and cross-package conformance testing

### DriftCore contributes

- explicit separation of governance requirements, deployment-selected values,
  and firmware or mechanical enforcement
- operating-condition-dependent envelopes and safe fallback outside the
  operational design domain (ODD)
- freshness, provenance, and replay considerations for condition evidence
- multidimensional envelope comparison that treats missing dimensions as
  unbounded and refuses ambiguous fallback selection
- adversarial tests for alternate widening paths, audit failure, stale
  conditions, and unsafe deployment declarations

These are complementary claims, not interchangeable guarantees. A signed SINT
token can authorize a command within a limit without proving that a safety PLC
or firmware independently enforces that limit. Conversely, a DriftCore
declaration can describe where enforcement should live without providing
SINT's end-to-end cryptographic authority chain.

## Trust Boundaries To Preserve

The collaboration should preserve these distinctions in every document and
demo:

1. **Authorization is not physical enforcement.** A policy decision cannot
   substitute for a certified safety controller, firmware limit, relay,
   mechanical stop, or other independent protection.
2. **Attestation is not a string claim.** Evidence is trusted only after an
   identified verifier authenticates it and checks freshness, scope, and replay.
3. **Operator identity is cryptographic.** A caller-supplied label such as
   `authorised_by="alice"` is metadata, not proof of human authorization.
4. **Tightening and widening are asymmetric.** Runtime layers may tighten an
   envelope automatically. Widening requires separately authenticated authority,
   a reason, an audit event, and deployment policy approval.
5. **Unknown is not safe.** Missing or stale operating-condition evidence cannot
   activate a more permissive envelope.
6. **The machine remains deployment-owned.** Neither project should claim that
   middleware alone makes a physical system safe or standards-compliant.

## Proposed Interoperability Model

The initial research model has four independently reviewable artifacts:

| Artifact | Producer | Consumer | Required property |
| --- | --- | --- | --- |
| Deployment envelope | deployment authority | token issuer and gateway | named limits, bounded dimensions, ODD, enforcement point |
| Enforcement attestation | firmware, PLC, supervisor, or auditor | approved verifier | cryptographically bound to device, envelope digest, and software/firmware identity |
| Condition evidence | trusted sensor or safety controller | envelope selector | authentic, fresh, scoped, ordered, and replay-resistant |
| Execution authorization | SINT policy gateway | execution broker or actuator boundary | bound to the exact request, active envelope, evidence digests, and approval |

The effective physical limit is the intersection of independently applicable
limits:

```text
effective limit = min(
  token-authorized limit,
  deployment-envelope limit,
  condition-derived tightening,
  hardware-reported limit
)
```

No input in that computation may silently introduce an unbounded dimension or
widen another input. A permissive envelope may become active only when its
pre-authorized operating conditions are proven; condition evidence does not
create new authority.

## Research Program

### Phase 0 — Independent review and scope agreement

Target: one or two maintainer review cycles.

Deliverables:

- SINT reviews DriftCore's physical-envelope and mediated-actuation claims.
- DriftCore reviews SINT's token constraints, dynamic envelopes, deployment
  evidence, and execution boundary.
- Each project publishes at least three counterexamples or failure cases against
  the other's proposed model.
- Maintainers agree on terminology for envelope, ODD, enforcement point,
  attestation, authorization, tightening, and widening.

Exit criteria:

- disagreements and unresolved assumptions are recorded rather than normalized
  away;
- no public claim suggests adoption, certification, or endorsement;
- the shared scope fits in one conformance profile.

### Phase 1 — Threat-model and vocabulary crosswalk

Deliverables:

- a two-column mapping between DriftCore envelope concepts and SINT types;
- a shared data-flow diagram from sensor evidence through physical execution;
- attacker models covering compromised agent, compromised bridge, stale sensor,
  malicious operator identity, verifier compromise, audit outage, and direct
  hardware bypass;
- an explicit trusted-computing-base register for both implementations.

Required adversarial cases:

- missing dimension interpreted as zero rather than unbounded;
- incomparable force/speed envelopes with no unique safe fallback;
- stale `fence_closed` evidence keeping a permissive envelope active;
- envelope widening through selection rather than the update API;
- forged proof represented by a non-empty but unauthenticated value;
- human authorization inferred from a caller-provided name;
- audit failure before a widening commit and during an emergency tightening;
- valid policy authorization sent through a direct, unmediated actuator path.

Exit criteria:

- every case has an expected fail-closed outcome and an assigned enforcement
  owner;
- neither project claims to mitigate a case owned by firmware, IAM, or physical
  safety hardware.

### Phase 2 — Protocol-neutral fixture pack

Deliverables:

- versioned JSON Schema for a deployment envelope;
- versioned JSON Schema for enforcement and operating-condition evidence;
- canonical JSON examples and deterministic digests;
- positive and negative fixture vectors under Apache-2.0;
- equivalent test runners in TypeScript and Python.

Minimum fixture matrix:

| Case | Expected result |
| --- | --- |
| signed envelope, verified firmware, fresh ODD evidence | eligible for normal policy evaluation |
| physical action with no declared envelope | deny |
| agent-software-only enforcement | deny for the independent-enforcement profile |
| stale, unsigned, untrusted, or replayed condition evidence | use safe fallback or deny |
| runtime tightening | allow the tighter bound and record it |
| runtime widening without authenticated approval | deny |
| incomparable fallback envelopes | configuration error unless an admissible fallback is explicitly selected |
| verifier or audit dependency unavailable | deny widening; complete emergency tightening before reporting the fault |

Exit criteria:

- both implementations produce the same outcome for every shared vector;
- tests do not import runtime code from the other project;
- fixture provenance and licenses are documented.

### Phase 3 — Reference interop adapter

Deliverables:

- a small adapter that converts a verified DriftCore deployment-envelope result
  into SINT deployment evidence without trusting raw caller assertions;
- digest binding from the SINT request and token to the selected envelope,
  enforcement attestation, and condition-evidence set;
- an execution receipt identifying which verifier accepted each proof;
- one simulated ROS 2 or industrial-cell scenario with no real actuator attached.

Security requirements:

- asymmetric signatures or hardware-backed attestations for production-shaped
  examples; prototype HMACs must be labelled as prototypes;
- verifier allowlists and key rotation behavior;
- freshness deadlines based on an explicit clock model;
- atomic replay protection suitable for multiple processes;
- no fail-open path when attestation is mandatory for T2/T3 execution.

Exit criteria:

- the scenario demonstrates allow, deny, automatic tightening, ODD fallback,
  authenticated widening approval, replay rejection, and e-stop behavior;
- all decisions appear in a tamper-evident evidence chain;
- a reviewer can reproduce the demo from a clean checkout.

### Phase 4 — Independent evaluation

Deliverables:

- exchanged red-team suites: each project runs tests authored by the other;
- fault injection for verifier outage, clock skew, concurrent replay, sensor
  disagreement, partial audit failure, and broker restart;
- latency measurements separated into policy, verification, persistence, and
  actuation-boundary costs;
- residual-risk report listing what remains deployment- or hardware-owned.

Exit criteria:

- no unresolved critical bypass in the declared threat model;
- results include failed experiments and limitations;
- benchmark environments and raw result artifacts are published.

### Phase 5 — Standards and adoption decision

Only after Phases 0-4 should maintainers decide whether to:

- publish the fixture format as a SINT interoperability profile;
- maintain it as an independent protocol-neutral artifact;
- submit a joint workshop paper or standards contribution;
- build production adapters; or
- conclude that the models should remain separate and preserve only the shared
  tests.

No production dependency, compatibility promise, or joint branding is implied
before this decision.

## Collaboration Mechanics

Professional open-source collaboration needs explicit operating rules:

- use public issues or discussions for design decisions;
- keep one narrowly scoped PR per artifact;
- require review from at least one maintainer from each project for shared
  schemas and fixtures;
- record dissent and alternatives in ADRs rather than requiring consensus on
  philosophy;
- disclose AI-assisted contributions and independently review security-critical
  code;
- use SPDX headers and retain source attribution for adapted material;
- use the Apache-2.0 licenses of both repositories, while checking third-party
  inputs separately;
- follow each repository's security policy for exploitable findings and publish
  them only after coordinated remediation;
- never describe the collaboration as certification, validation, partnership,
  or adoption without explicit written agreement.

Suggested cadence:

- asynchronous issue updates for normal work;
- a fortnightly milestone review while a shared artifact is active;
- a short decision record after each phase;
- pause after any phase if the evidence does not justify continuing.

## First Milestone

The smallest credible joint milestone is a **Physical Envelope Attestation
Profile v0.1** containing:

1. a terminology and threat-model crosswalk;
2. schemas for deployment envelope, enforcement attestation, and condition
   evidence;
3. ten shared adversarial fixtures;
4. Python and TypeScript conformance runners;
5. one simulated fenced-cell demonstration;
6. a residual-risk statement naming the physical protections the profile cannot
   provide.

This milestone is successful if both projects can reject the same unsafe cases.
It does not require either project to adopt the other's architecture.

Implementation progress:

- v0.1 protocol-neutral evidence-transition fixtures and a SINT runner are
  published in
  [`docs/guides/physical-envelope-attestation-fixtures.md`](../guides/physical-envelope-attestation-fixtures.md);
- the fixture includes a load-bearing positive control plus false retraction,
  expiry, proof failure, verifier outage, non-finite TTL, equal-sequence
  conflict, source disagreement, restart replay, and exact evidence-binding
  cases;
- a Python runner and independent DriftCore outcome report remain open for
  cross-project review.

## Open Questions For Review

1. Which enforcement points qualify as independent for each threat model:
   separate process, kernel boundary, safety PLC, firmware, or mechanical stop?
2. What cryptographic statement can real firmware or a safety PLC produce about
   its configured physical limits?
3. Should permissive-envelope activation require one attestor or an M-of-N set
   of independent condition sources?
4. How should a safe fallback be selected when envelope dimensions are
   incomparable?
5. Which clock and replay guarantees are realistic on intermittently connected
   robots?
6. How should emergency tightening be recorded when the audit system is down?
7. Which parts can be tested without implying machinery certification?

## Review Basis

This proposal was prepared from the public DriftCore repository at commit
[`55f0a7524766b9cc883eb807fe37d669f81feae7`](https://github.com/justingracie-defender/driftcore-os/commit/55f0a7524766b9cc883eb807fe37d669f81feae7)
and the SINT `main` branch at commit
[`2461a91`](https://github.com/sint-ai/sint-protocol/commit/2461a91).

The initial DriftCore review focused on:

- `driftcore/governance/physical_envelope.py`
- `driftcore/verification/governed_actuator.py`
- `test_physical_envelope.py`
- `MEDIATED_ACTUATION.md`
- `SAFETY_CASE.md`
- `THREAT_BOUNDARIES.md`

The initial SINT review focused on capability-token constraints, dynamic
envelope handling, deployment evidence, `PolicyGateway.intercept()`, and the
execution broker. Findings should be revalidated when either implementation
changes.

## Invitation

Justin: we would value a critical review of this roadmap, especially the trust
boundary between a DriftCore/LifeCore deployment declaration and independently
verifiable firmware or hardware enforcement. The proposed first step is a small,
protocol-neutral fixture set. Please challenge the assumptions, add failure
cases, or suggest a smaller experiment before either project changes runtime
code.

The desired outcome is not architectural convergence. It is better evidence
about which guarantees hold at the agent-to-machine boundary and reusable tests
that make unsafe claims harder for any implementation to pass.
