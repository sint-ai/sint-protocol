# AutoGen Interop Fixtures

This guide documents the executable fixture set for AutoGen interoperability in SINT.

Fixture file:

- `packages/conformance-tests/fixtures/interop/autogen-capability-trust.v1.json`

Conformance runner:

- `packages/conformance-tests/src/autogen-interop-conformance.test.ts`

## What is covered

- policy callback + capability validation hook behavior
- trust signal to tier escalation matrix
- evidence emission expectations (`policy.evaluated`, trust events)
- edge fail-closed behavior when central approval is unavailable for T2/T3

## Scenarios

1. Callback vs direct gateway parity for two representative tasks
2. Trust matrix outcomes:
   - `unrestricted`
   - `medium_risk`
   - `high_risk`
   - `blocked`
3. Edge disconnect fail-closed denial for trust-escalated actions

## Run locally

```bash
pnpm --filter @sint/conformance-tests test -- src/autogen-interop-conformance.test.ts
pnpm --filter @sint/conformance-tests test:fixtures
```

## Maintainer notes

- Keep fixture schema stable; add new fields as optional first.
- If trust semantics change, update both fixture and expected matrix in one PR.
- For new edge behaviors, add deterministic fail-closed cases before merging runtime code.
