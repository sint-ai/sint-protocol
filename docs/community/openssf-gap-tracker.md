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
| OpenSSF Best Practices project profile started | todo | TBD | TBD | TBD | Link public OpenSSF profile/checklist |
| Security policy and vuln reporting path verified | in-progress | [SECURITY.md](https://github.com/sint-ai/sint-protocol/blob/main/SECURITY.md) | core maintainers | 2026-06-01 | Confirm disclosure contact and response SLA |
| Release candidate checklist used on tagged RC | in-progress | `.github/ISSUE_TEMPLATE/release_candidate_checklist.yml` | release owner | 2026-06-15 | First completed issue should link CI and conformance evidence |
| SBOM or dependency review path documented | todo | TBD | TBD | TBD | Add guide or automated generation path |
| Signed production-slice validation artifact published | in-progress | [Production Slice Verification](../guides/production-slice-verification) | gateway team | 2026-06-15 | Link a concrete run from external evaluator once available |

## Update Cadence

- review weekly in maintainer sync
- update before every release candidate tag
- include major updates in release candidate checklist issues
