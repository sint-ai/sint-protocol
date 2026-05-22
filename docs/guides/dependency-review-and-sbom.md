# Dependency Review And SBOM Path

This guide defines the baseline dependency-review workflow for AAIF Gate 5
evidence and OpenSSF gap tracking.

## Run The Review

From repo root:

```bash
pnpm run security:dependency-review
```

This command:

1. computes SHA-256 for `pnpm-lock.yaml`
2. runs `pnpm audit --prod --json`
3. writes a raw audit artifact to `docs/reports/dependency-audit-YYYY-MM-DD.json`
4. writes a summary report to `docs/reports/dependency-review-latest.md`

## Optional Gate Mode

To fail when high/critical vulnerabilities are present:

```bash
node ./scripts/generate-dependency-review-report.mjs --fail-on-findings
```

## Current Release Policy (2026-05-22)

- baseline OpenSSF workflow requirement: `pnpm run security:dependency-review`
- release-candidate requirement: attach `dependency-review-latest.md` and dated
  raw audit JSON in the RC checklist issue
- high/critical finding handling:
  open a remediation issue with owner and target date before release sign-off
- strict blocking mode:
  use `--fail-on-findings` when a release train explicitly requires zero
  high/critical findings

This policy keeps AAIF/OpenSSF evidence reproducible while preserving an
explicit remediation trail when findings exist.

## Latest Example Artifact

Most recent generated artifacts:

- `docs/reports/dependency-review-latest.md`
- `docs/reports/dependency-audit-2026-05-22.json`

Current high-severity remediation tracker:

- [Issue #209](https://github.com/sint-ai/sint-protocol/issues/209)

## Evidence Expectations

For AAIF and OpenSSF tracking, attach:

- the generated `dependency-review-latest.md`
- the dated raw audit JSON artifact
- the commit SHA and date range where the review was run
- linked remediation issues for any high/critical findings
