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

## Evidence Expectations

For AAIF and OpenSSF tracking, attach:

- the generated `dependency-review-latest.md`
- the dated raw audit JSON artifact
- the commit SHA and date range where the review was run
- linked remediation issues for any high/critical findings
