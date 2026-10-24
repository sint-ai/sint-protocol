# Predictive execution bug-fix recheck — 24 October 2026

Scope: PR [#270](https://github.com/sint-ai/sint-protocol/pull/270), originally
at `bb29cd1`, reconciled with `main` at `915b4d7`. The original worktree was
clean and its baseline `pnpm run verify` passed.

## Original findings

The 11 original fixes remain on the feature branch. Their presence does not
mean they have landed on `main` or received a clean second cloud review.

| Original finding | Current implementation and recheck |
|---|---|
| f1: effect-plan parameter substitution | Simulator recomputes the digest; existing substitution regression passes. |
| f2 / exp:f2: pinned proof hash and verifier | Pinned metadata checks retained; trusted attestation lookup now also required. |
| f3 / exp:f3: inherited manufacturing evidence and context binding | Shared evaluator retained and authenticated; both envelope paths have conformance coverage. |
| exp:f4: inspection part/revision mismatch | Binding retained; inline and reference-only receipts now require a trusted quality-system record. |
| exp:f5: nested export references | Prior stripping retained; authority, nonconformance, rework and nested-only artifact references now also filtered. |
| exp:f6 / f5: response-body deadline | Abort deadline remains active through body reading; a stalled-body regression passes. |
| exp:f7: expiry during nonce consumption | Expiry recheck retained and explicitly tested; VLA deadline is also checked before dispatch. |
| exp:f9: published simulation-evidence schema | Catalog field retained and asserted by the schema-catalog test. |
| f4: future deployment observations | Future-time rejection retained; caller timestamps must also match authenticated records. |
| f6: factory export signer mismatch | Public key still derives from the signing key; export verifies even with a mismatched fixture key. |
| f7: simulator clock skew | Configurable tolerance retained; within-default and over-configured-limit cases pass. |

## Additional fixes

The four findings in the latest GitHub review were confirmed and fixed:

1. Deployment proof freshness previously trusted caller-provided metadata.
   The default gate now requires `resolveDeploymentEvidence`, compares the
   authenticated fields, and checks freshness after lookup.
2. Passing inspection status could be fabricated. The default manufacturing
   gate now requires `resolveInspectionReceipt`, authenticates inline records
   or resolves references, and checks calibration expiry and actual measurements.
3. Concurrent VLA requests with distinct receipts could dispatch the same
   sequence twice. Each stream now serializes validation through dispatch and
   state update. Unit and conformance regressions cover distinct receipts.
4. Fully redacted exports retained artifacts linked to nonconformance/rework
   references. All removed references now participate in artifact filtering,
   including authority tokens and nested-only approval/inspection references.

Integration with `main` exposed another defect: the SQL token store omitted
`deploymentEnvelope`, `manufacturingEnvelope`, `hazardousEnergyEnvelope` and
`adaptationPermit`. The store, fresh schema, idempotent bootstrap and new migration
`008_predictive_policy_fields.sql` now preserve them. Expanded transport and real
PostgreSQL tests verify both read paths, signed replacement, and signature
failure after SQL removal or widening of each policy field.

The merge retains the security fixes already on `main` from #265, #267, #268 and
#269, including fail-closed dynamic envelopes and the explicit service integration
gate. New evidence resolver failures use the bounded, audited plugin path.
Public inventory counts were corrected to 56 workspaces, 43 packages and 17 bridges.

## Verification

- `pnpm install --frozen-lockfile`: passed.
- `pnpm run verify`: passed; build 56/56 tasks, typecheck 79/79 tasks,
  workspace build/test stage 110/110 tasks. Vitest reported 3,089 passed cases
  and 93 service-dependent skips; the integration-gate validator's 9 Node tests passed.
- `pnpm run test:integration` against isolated PostgreSQL 17 and Redis:
  32 persistence cases and 61 gateway persistence cases passed, zero skipped.
  This explicit runner executes the cases whose environment Turbo filters out.
- `pnpm run cert:fixtures`: passed.
- Agent onboarding and public-facts contracts: passed.
- `pnpm run docs:build`: passed after correcting two repository-root links in
  the existing unified delivery roadmap.
- VLA concurrency and export-redaction regressions: passed.

## Merge status

The local conflicts with `main` are resolved. This report is local test and code
review evidence, not an OhMyBug attestation. The OhMyBug MCP endpoint returned
HTTP 401 requiring OAuth or an API key; no authenticated cloud re-hunt was
submitted and no current account balance was checked.

PR #270 still includes the pre-existing unfinished VLA/perception/consequence
work. Before merging, that scope must be completed and reviewed or separated,
remote CI must pass on the updated head, and the clean round-2 OhMyBug report and
attestation must cover the final commit. No merge-gate records were changed.

See [authenticated factory evidence](../guides/authenticated-factory-evidence.md)
for resolver configuration, migration requirements and broker ownership limits.
