# AAIF Evidence Item: production-slice-external-validation

- Type: conformance
- Organization: SINT Protocol (public repository artifact)
- Independent from current co-design network: yes
- Public URL: https://github.com/sint-ai/sint-protocol/blob/main/docs/reports/production-slice-validation-artifact.md
- Date range: 2026-05-21 to 2026-05-21
- SINT component used: `apps/gateway-server` production-slice contract
- Verification method: repeatable CI-compatible test execution plus signed artifact payload hash
- Contact or accountable owner: core maintainers (`@pshkv`)

## Notes

- Artifact format includes a declared redaction boundary to keep the report
  externally reviewable without exposing operational secret material.
- The artifact captures:
  issue, intercept, evidence persistence, chain proof, revocation, and fail-closed
  behavior.
- Source files:
  - `docs/reports/production-slice-validation-artifact.json`
  - `docs/reports/production-slice-validation-artifact.md`
  - `docs/reports/production-slice-validation-vitest.json`
