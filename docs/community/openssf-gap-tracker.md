# OpenSSF Best Practices Gap Tracker

This page tracks OpenSSF Best Practices readiness work for AAIF Gate 5.

Use it as the public source of truth for what is done, what is in progress, and
what still blocks release-readiness claims.

## Tracking Rules

- each row must link to evidence (issue, PR, doc page, or release artifact)
- mark status as `done` only after evidence is merged and publicly visible
- keep ownership explicit so follow-up does not stall

## Gap Table

| Area | Current status | Evidence | Owner | Target date | Notes |
| --- | --- | --- | --- | --- | --- |
| OpenSSF Best Practices project profile started | in-progress | [Issue #191](https://github.com/sint-ai/sint-protocol/issues/191) | core maintainers | 2026-06-01 | Baseline assessment and gap filing task opened |
| Security policy and vuln reporting path verified | done | [Issue #192](https://github.com/sint-ai/sint-protocol/issues/192), [Vulnerability Reporting and Response](../security/vulnerability-reporting-and-response) | core maintainers | 2026-06-01 | Disclosure contact and SLA are now aligned with verified repo documentation |
| Release candidate checklist used on tagged RC | done | [Issue #195](https://github.com/sint-ai/sint-protocol/issues/195), [RC Checklist #207](https://github.com/sint-ai/sint-protocol/issues/207), [AAIF Release Gate Evidence 2026-05-21](../reports/aaif-release-gate-2026-05-21), [AAIF Evidence Item](./aaif-evidence/2026-05-21-release-v0-3-0-rc1-release-gate) | release owner | 2026-06-15 | First tagged RC checklist run is complete with linked build/test/docs/conformance evidence |
| SBOM or dependency review path documented | in-progress | [Issue #194](https://github.com/sint-ai/sint-protocol/issues/194), [Dependency Review And SBOM Path](../guides/dependency-review-and-sbom) | core maintainers | 2026-06-15 | Baseline workflow added; awaiting first published review artifact |
| Signed production-slice validation artifact published | done | [Issue #193](https://github.com/sint-ai/sint-protocol/issues/193), [Production Slice Validation Artifact](../reports/production-slice-validation-artifact), [AAIF Evidence Item](./aaif-evidence/2026-05-21-conformance-production-slice-external-validation) | gateway team | 2026-06-15 | Artifact format, redaction boundary, and signed report are published |

## Update Cadence

- review weekly in maintainer sync
- update before every release candidate tag
- include major updates in release candidate checklist issues
