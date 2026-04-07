# action_ref Identity + Explainability Profile (v1)

This profile defines a minimal cross-engine comparability contract for governance decisions.

## Goal

Allow independent runtimes to evaluate the same request identity without requiring semantic lockstep in policy internals.

## Core Rule

`action_ref` identifies request identity, not policy semantics.

Two evaluations are comparable at identity level when they derive the same `action_ref` from the same identity tuple.

## Canonical `action_ref` Construction

Hash algorithm:

- `sha256`

Identity tuple (in order):

1. `agentId`
2. `resource`
3. `action`
4. `scope`
5. `timestamp`

Canonical payload:

```text
agentId|resource|action|scope|timestamp
```

`action_ref = sha256(canonical_payload)`

## Explainability Contract

When two engines produce different verdicts for the same `action_ref`, both MUST emit machine-readable decision context for comparisons to remain valid:

- `policy_profile`
- `rule_ids[]`
- `constraint_digest`
- `decision_time`

Verdict divergence is acceptable if and only if explainability context is complete.

## Artifact Linkage Contract

Decision and execution evidence should remain linkable via:

- shared `action_ref`
- `decisionArtifact.compoundDigest == executionReceipt.decisionArtifactDigest`

This permits cross-system audit stitching without forcing equivalent internal rule engines.

## Conformance Fixture

Fixture path:

- `packages/conformance-tests/fixtures/interop/action-ref-explainability.v1.json`

Executable test:

- `packages/conformance-tests/src/action-ref-explainability-conformance.test.ts`

Run with:

```bash
pnpm --filter @sint/conformance-tests test:fixtures
```
