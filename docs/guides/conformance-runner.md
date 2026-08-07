# Conformance Runner

SINT packages the conformance suite as a repeatable command-line report so
external users can validate the reference implementation against the same
fixture-driven checks used in the repo.

## Run It

```bash
pnpm run conformance:report
```

That command runs `@pshkv/conformance-tests` with Vitest JSON output and writes
three artifacts:

- `docs/reports/conformance-validation-artifact.json`
- `docs/reports/conformance-validation-artifact.md`
- `docs/reports/conformance-validation-vitest.json`

## What The Report Means

- `PASS` means every conformance suite in the package passed.
- `FAIL` means at least one suite or assertion failed.
- The JSON artifact is signed with an ephemeral report key so the published
  body can be checked as an immutable release record.

## What It Covers

The packaged runner includes the repository's fixture-driven conformance
surface, including token attenuation, policy enforcement, ledger integrity,
bridge mappings, and physical-AI safety fixtures.

It is intentionally separate from the production-slice gate:

- production slice verifies the supported gateway path
- conformance runner packages the broader fixture suite for external replay

