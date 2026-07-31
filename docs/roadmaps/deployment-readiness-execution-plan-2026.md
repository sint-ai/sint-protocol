# Deployment Readiness Execution Plan

Status: active build plan

This plan turns the four new research roadmaps into executable SINT work:

- [Autonomous Factory Readiness](./autonomous-factory-readiness-2026.md)
- [Roadway Edge Intelligence](./roadway-edge-intelligence-2026.md)
- [Humanoid Deployment Governance](./humanoid-deployment-governance-2026.md)
- [Human-Agent Authority](./human-agent-authority-2026.md)

The shared product direction is simple: SINT should become the policy,
authority, supervision, and evidence layer for autonomous systems that move
from demos into real deployments.

## Build Order

Build the shared protocol primitives first, then add vertical packs.

```text
shared authority + evidence core
  -> human-agent authority
  -> manufacturing / humanoid / roadway envelopes
  -> adapter profiles
  -> operator workflows
  -> readiness reports and signed evidence bundles
```

This avoids four separate one-off implementations for factories, roads,
humanoids, and agent payments.

## Non-Negotiable Invariants

- Every authorization decision still flows through `PolicyGateway.intercept()`.
- Capability and authority tokens remain attenuation-only.
- Runtime plugins can tighten scope, never widen it.
- Missing required proof fails closed for T2/T3 actions.
- Human proof, biometric, or identity data is referenced by digest/proof ref,
  not stored raw in the ledger.
- Evidence ledger events remain append-only and hash-chained.
- E-stop remains unconditional and does not wait for identity proof.
- Bridges normalize facts; the gateway decides.

## Architecture Target

```text
Agent / operator / scheduler / model / bridge
  -> SintRequest
  -> token validation
  -> human-agent authority checks
  -> deployment envelope checks
  -> skill / model / program provenance checks
  -> kinetic / spatial / hardware safety checks
  -> tier assignment and approval quorum
  -> allow / deny / escalate / transform
  -> adapter execution
  -> evidence ledger + trace bundle
```

## Shared Primitives To Build First

### P0. Human Authority Core

Why first:

Human authority is a cross-cutting dependency for agent payments, T2/T3
operator approvals, teleoperation, high-risk robot actions, and M-of-N quorum.

Deliverables:

- `HumanPrincipalRef`
- `HumanAuthorityEnvelope`
- `HumanDelegationChain`
- `HumanProofVerifierPlugin`
- privacy-preserving approval receipt shape
- uniqueness-aware quorum checks
- conformance fixtures for stale, missing, insufficient, duplicate, and
  context-mismatched proofs

Primary files:

- `packages/core/src/types/authority.ts`
- `packages/core/src/schemas/authority.schema.ts`
- `packages/core/src/schemas/index.ts`
- `packages/core/src/index.ts`
- `packages/policy-gateway/src/human-authority-policy.ts`
- `packages/policy-gateway/src/approval-flow.ts`
- `packages/policy-gateway/src/index.ts`
- `packages/conformance-tests/fixtures/authority/human-agent-authority.v1.json`
- `packages/conformance-tests/src/human-agent-authority-conformance.test.ts`

Tests:

```bash
pnpm --filter @pshkv/core test
pnpm --filter @pshkv/gate-policy-gateway test
pnpm --filter @pshkv/conformance-tests test
```

Definition of done:

- T3 can require a unique human proof plus delegated agent scope.
- Duplicate credentials from the same human cannot satisfy M-of-N quorum.
- The ledger stores proof refs and hashes, not raw identity material.
- Existing approval flows still pass.

### P0. Deployment Envelope Base

Why first:

Factory, roadway, and humanoid envelopes should share validation patterns
instead of copying code.

Deliverables:

- `DeploymentEnvelopeBase`
- `ProofFreshnessRequirement`
- `ContextualBinding`
- `RequiredEvidenceRef`
- common helper for `missing/stale/wrong-context` denial decisions
- shared ledger event names:
  - `deployment.proof.verified`
  - `deployment.proof.missing`
  - `deployment.context.mismatch`
  - `deployment.envelope.violation`

Primary files:

- `packages/core/src/types/deployment-envelope.ts`
- `packages/core/src/schemas/deployment-envelope.schema.ts`
- `packages/policy-gateway/src/deployment-envelope-policy.ts`
- `packages/evidence-ledger/src/deployment-evidence.ts`

Definition of done:

- Vertical envelopes can reuse shared freshness, context-binding, and evidence
  checks.
- Existing spatial execution envelopes keep working.

### P0. Trace Bundle Base

Why first:

Factory part traces, roadway incident bundles, humanoid incident bundles, and
human authority receipts should share a signed evidence-bundle pattern.

Deliverables:

- `TraceBundleBase`
- `EvidenceArtifactRef`
- `RedactionProfile`
- `CorrectionEventRef`
- common signature/verification helpers
- `sintctl trace verify`

Primary files:

- `packages/core/src/types/trace-bundle.ts`
- `packages/core/src/schemas/trace-bundle.schema.ts`
- `packages/evidence-ledger/src/trace-bundle.ts`
- `apps/sintctl/src/trace.ts`

Definition of done:

- A generic trace bundle can be built and verified.
- Domain bundles can extend the base without custom signing logic.

## Vertical Workstreams

### V1. Autonomous Factory Pack

Build after P0 authority and deployment envelope base.

Deliverables:

- `ManufacturingExecutionEnvelope`
- `CellGraph` v2
- `DFMVerdict`
- `InspectionReceipt`
- `PartTraceBundle`
- MES / SCADA / PLC adapter profiles
- `sintctl factory trace export`
- factory readiness report

Primary files:

- `packages/core/src/types/factory.ts`
- `packages/core/src/schemas/factory.schema.ts`
- `packages/policy-gateway/src/factory-authority-policy.ts`
- `packages/evidence-ledger/src/factory-trace-bundle.ts`
- `apps/sintctl/src/factory.ts`
- `sint-industrial/schemas/factory-cell-graph.v2.schema.json`
- `sint-industrial/policies/factory-deployment-policy.yaml`
- `packages/conformance-tests/fixtures/industrial/autonomous-factory-readiness.v1.json`

First scenarios:

- CAM program digest mismatch denies.
- Drawing revision mismatch denies.
- Unauthorized material substitution escalates or denies.
- Missing inspection receipt blocks downstream operation.
- Stale PLC permit denies physical execution.

### V2. Roadway Edge Intelligence Pack

Build after P0 envelope base and trace bundle base.

Deliverables:

- `RoadwayExecutionEnvelope`
- roadway resource URI conventions
- traffic-controller tier rules
- SPaT/MAP/BSM/PSM/SRM/SSM receipt schemas
- `RoadwayActorContext`
- `RoadwayIncidentBundle`
- `bridge-traffic-controller` skeleton
- `sintctl roadway incident export`
- roadway readiness report

Primary files:

- `packages/core/src/types/roadway.ts`
- `packages/core/src/schemas/roadway.schema.ts`
- `packages/policy-gateway/src/roadway-policy.ts`
- `packages/evidence-ledger/src/roadway-incident-bundle.ts`
- `packages/bridge-traffic-controller/src/index.ts`
- `apps/sintctl/src/roadway.ts`
- `packages/conformance-tests/fixtures/roadway/roadway-edge-intelligence.v1.json`

First scenarios:

- Wrong intersection denies.
- Stale MAP revision denies.
- Unauthorized timing-plan change escalates T3.
- Conflicting priority requests escalate.
- Low-confidence vulnerable road user near conflict zone deautomates.

### V3. Humanoid Deployment Governance Pack

Build after P0 authority, deployment envelope base, and kinetic-envelope wiring.

Deliverables:

- `HumanoidExecutionEnvelope`
- `HumanoidSkillMetadata`
- whole-body kinetic envelope provider surface
- `HumanFactorsContext`
- `TeleoperationSession`
- `HumanoidComponentManifest`
- `HumanoidIncidentBundle`
- `sintctl humanoid readiness report`
- `sintctl humanoid incident export`

Primary files:

- `packages/core/src/types/humanoid.ts`
- `packages/core/src/schemas/humanoid.schema.ts`
- `packages/policy-gateway/src/humanoid-policy.ts`
- `packages/policy-gateway/src/humanoid-skill-guard.ts`
- `packages/evidence-ledger/src/humanoid-incident-bundle.ts`
- `packages/autonomy-supervisor/src/humanoid-guard-profile.ts`
- `apps/sintctl/src/humanoid.ts`
- `packages/conformance-tests/fixtures/humanoid/humanoid-deployment-governance.v1.json`

First scenarios:

- Wrong robot/site denies.
- Mutated VLA/skill digest denies.
- Novel whole-body behavior escalates.
- Payload instability vetoes.
- Silent teleop takeover denies.
- Missing intent signal near humans escalates.

### V4. Human-Agent Authority Pack

Build first as P0, then extend into payment and physical approvals.

Deliverables:

- agent payment spending authority profile
- physical AI high-assurance approval profile
- teleoperation human authority binding
- DID/VC, passkey, hardware-attestation, ZK-proof, and IAM verifier stubs
- `sintctl authority verify`
- `sintctl authority receipt export`

Primary files:

- `packages/bridge-economy/src/spending-authority.ts`
- `packages/policy-gateway/src/human-authority-policy.ts`
- `apps/sintctl/src/authority.ts`
- `apps/dashboard/src` approval display updates
- `apps/sint-interface/src` approval display updates

First scenarios:

- Missing proof denies T3.
- Insufficient assurance escalates or denies.
- Proof replay outside context denies.
- Same human cannot satisfy two quorum slots.
- Payment outside delegated amount denies.

## Start Today

### Branch

```bash
git switch main
git pull --rebase
git switch -c feat/deployment-readiness-execution
```

### Baseline

```bash
pnpm run build
pnpm run test
```

If the full suite is too slow while iterating, run focused loops:

```bash
pnpm --filter @pshkv/core test
pnpm --filter @pshkv/gate-policy-gateway test
pnpm --filter @pshkv/conformance-tests test
```

### Today Task 1: Human Authority Types

Create:

- `packages/core/src/types/authority.ts`
- `packages/core/src/schemas/authority.schema.ts`

Minimum shape:

```ts
export type HumanAssuranceLevel =
  | "none"
  | "humanhood"
  | "uniqueness"
  | "delegation"
  | "contextual_binding";

export interface HumanPrincipalRef {
  readonly principalRef: string;
  readonly assuranceLevel: HumanAssuranceLevel;
  readonly proofRef?: string;
  readonly proofHash?: string;
  readonly verifierRef?: string;
  readonly observedAt?: string;
}

export interface HumanDelegationChain {
  readonly principal: HumanPrincipalRef;
  readonly agentId: string;
  readonly scope: {
    readonly resources: readonly string[];
    readonly actions: readonly string[];
    readonly expiresAt: string;
  };
  readonly consentReceiptDigest?: string;
}
```

Acceptance:

- schemas reject missing principal refs and malformed proof hashes.
- exports are available from `@pshkv/core`.
- no gateway behavior changes yet.

### Today Task 2: Human Authority Gateway Plugin

Create:

- `packages/policy-gateway/src/human-authority-policy.ts`
- `packages/policy-gateway/__tests__/human-authority-policy.test.ts`

Minimum behavior:

- if a token or request requires `delegation`, deny when missing;
- deny stale proof if `maxProofAgeMs` is exceeded;
- deny context mismatch for resource/action;
- emit `authority.human.verified` on pass;
- fail closed on plugin error.

Acceptance:

```bash
pnpm --filter @pshkv/gate-policy-gateway test -- human-authority-policy
```

### Today Task 3: Conformance Fixture

Create:

- `packages/conformance-tests/fixtures/authority/human-agent-authority.v1.json`
- `packages/conformance-tests/src/human-agent-authority-conformance.test.ts`

Minimum scenarios:

- `missing-human-principal-deny`
- `stale-human-proof-deny`
- `insufficient-assurance-deny`
- `context-mismatch-deny`
- `fresh-context-bound-delegation-allow-or-escalate`

Acceptance:

```bash
pnpm --filter @pshkv/conformance-tests test -- human-agent-authority
```

### Today Task 4: Docs And Guide

Create:

- `docs/guides/human-agent-authority.md`

Include:

- how to configure the verifier plugin;
- what goes in the ledger;
- what never goes in the ledger;
- how T2/T3 authority maps to human proof.

Acceptance:

```bash
pnpm run docs:build
```

## Week 1 Plan

### Day 1: Human Authority Core

Output:

- authority types and schemas
- gateway plugin
- five conformance scenarios
- guide

PR title:

- `feat(authority): add human-agent authority proof gate`

### Day 2: Uniqueness-Aware Quorum

Output:

- approval quorum accepts optional uniqueness claims
- duplicate-human approval denied
- self-approval denial for T3 when the same principal delegated the agent
- dashboard displays assurance level and proof ref

PR title:

- `feat(approvals): enforce unique-human quorum`

### Day 3: Deployment Envelope Base

Output:

- shared proof freshness and contextual binding helpers
- reusable denial/event helpers
- migration of spatial integrity policy to shared helper where practical

PR title:

- `feat(policy): add deployment envelope proof helpers`

### Day 4: Manufacturing Envelope Slice

Output:

- `ManufacturingExecutionEnvelope`
- digest checks for drawing/CAM/program/material
- three conformance scenarios

PR title:

- `feat(factory): add manufacturing execution envelope`

### Day 5: Humanoid Envelope Slice

Output:

- `HumanoidExecutionEnvelope`
- robot/site/tool/posture mismatch checks
- initial skill/VLA metadata schema
- three conformance scenarios

PR title:

- `feat(humanoid): add deployment authority envelope`

## 30-Day Milestones

### Milestone 1: Human Authority GA Slice

- provider-neutral verifier interface
- privacy-preserving approval receipts
- unique-human quorum
- spending authority profile
- physical AI approval profile

Release evidence:

- conformance fixture pack
- docs guide
- sample redacted approval receipt

### Milestone 2: Factory Control Slice

- manufacturing envelope
- inspection receipt gate
- cell graph v2
- part trace bundle
- `sintctl factory trace export`

Release evidence:

- autonomous factory fixture pack
- sample part trace bundle
- readiness scorecard draft

### Milestone 3: Humanoid Control Slice

- humanoid envelope
- skill/VLA provenance guard
- teleoperation session binding
- human factors context
- humanoid incident bundle stub

Release evidence:

- humanoid deployment fixture pack
- sample after-action packet
- dashboard/operator copy

## 60-Day Milestones

- roadway execution envelope and traffic-controller bridge skeleton
- V2X evidence schemas
- whole-body kinetic envelope conformance
- factory MES/SCADA/PLC adapter profiles
- DID/VC and passkey verifier stubs
- redacted trace export mode for all bundle types

## 90-Day Milestones

- factory, roadway, humanoid, and authority packs all have executable
  conformance suites
- dashboard surfaces readiness and approval evidence for all four lanes
- `sintctl` exports:
  - `authority receipt`
  - `factory trace`
  - `roadway incident`
  - `humanoid incident`
- public docs include claim boundaries and deployment guides
- one external collaborator/adopter thread is mapped to a concrete fixture or
  adapter PR

## Issue Breakdown

Create issues in this order:

1. `authority: add HumanPrincipalRef and HumanDelegationChain schemas`
2. `authority: add HumanProofVerifierPlugin and gateway policy`
3. `authority: add privacy-preserving approval receipts`
4. `approvals: enforce uniqueness-aware quorum`
5. `economy: bind spending authority to human delegation`
6. `policy: add shared deployment envelope helpers`
7. `factory: add ManufacturingExecutionEnvelope`
8. `factory: add InspectionReceipt gate`
9. `factory: add PartTraceBundle export`
10. `humanoid: add HumanoidExecutionEnvelope`
11. `humanoid: add VLA and skill provenance guard`
12. `humanoid: add TeleoperationSession policy`
13. `humanoid: add HumanFactorsContext policy`
14. `roadway: add RoadwayExecutionEnvelope`
15. `roadway: add V2X receipt schemas`
16. `roadway: add traffic-controller bridge skeleton`
17. `dashboard: show authority assurance and readiness evidence`
18. `sintctl: add authority/factory/roadway/humanoid export commands`

## Test Gates For Every PR

Minimum:

```bash
pnpm --filter @pshkv/core test
pnpm --filter @pshkv/gate-policy-gateway test
pnpm --filter @pshkv/conformance-tests test
pnpm run build
pnpm run docs:build
```

Before merge:

```bash
pnpm run test
```

## Merge Policy

- Keep PRs small enough to review in one sitting.
- Add conformance fixtures with every new security invariant.
- Add docs with every new public policy surface.
- Do not merge vertical adapter behavior before the gateway policy exists.
- Do not add raw identity, biometric, video, or personal data to ledger payloads.
- Use proof refs, hashes, signatures, and redaction profiles instead.

