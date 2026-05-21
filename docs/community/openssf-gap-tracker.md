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
| Release candidate checklist used on tagged RC | in-progress | [Issue #195](https://github.com/sint-ai/sint-protocol/issues/195) | release owner | 2026-06-15 | First completed issue should link CI and conformance evidence |
| SBOM or dependency review path documented | in-progress | [Issue #194](https://github.com/sint-ai/sint-protocol/issues/194), [Dependency Review And SBOM Path](../guides/dependency-review-and-sbom) | core maintainers | 2026-06-15 | Baseline workflow added; awaiting first published review artifact |
| Signed production-slice validation artifact published | in-progress | [Issue #193](https://github.com/sint-ai/sint-protocol/issues/193) | gateway team | 2026-06-15 | Public artifact for external evaluator evidence |

## Update Cadence

- review weekly in maintainer sync
- update before every release candidate tag
- include major updates in release candidate checklist issues
