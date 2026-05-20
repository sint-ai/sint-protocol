# AAIF Resubmission Proposal Template

Use this template before submitting to AAIF. It is designed to prevent evidence
mixing across co-design, interop, pilot, and production.

## 1) Scope And Ask

- Submission date:
- Requested lifecycle stage:
- Why this stage matches current evidence:

## 2) Evidence By Class (Do Not Merge Classes)

### Co-design Evidence

List collaborators who shaped specification details.

Fields:

- organization
- relationship type
- contribution summary
- link

### Interop Evidence

List protocol or tooling interoperability work, without claiming deployment
adoption.

Fields:

- integration surface
- tested outcome
- environment (lab/staging/other)
- link

### Pilot Evidence

List bounded operational pilots.

Fields:

- organization
- pilot scope
- dates
- success criteria
- link

### Production Evidence

List only live operational deployments.

Fields:

- organization
- independent from co-design network: yes/no
- production scope
- first production date
- accountable owner
- verification URL

## 3) Maintainership Evidence

- independent maintainer organization:
- 90-day window start date:
- merged PR count during window:
- review participation on security-sensitive changes:
- ownership scope (`OWNERS.md`/CODEOWNERS path):
- evidence URL(s):

## 4) Reference Implementation Evidence

- gateway production deployment guide URL:
- production-slice validation evidence URL:
- persistent storage configuration evidence URL:
- signed request path evidence URL:

## 5) Conformance Evidence

- external runnable command:
- report format:
- pass/fail semantics doc:
- external run evidence URL:

## 6) OpenSSF And Release Readiness

- OpenSSF Best Practices profile/checklist URL:
- open gaps URL:
- release candidate checklist issue URL:
- release gate evidence URL (`pnpm run aaif:release-gate`):

## 7) Stage Decision Rubric

Use this quick rule to pick the requested stage:

- if production deployments are not yet independent and named, do not request
  Growth
- if maintainership diversity window is incomplete, do not request Growth
- if release/conformance/security evidence is still roadmap-only, request a
  lower stage with explicit readiness plan

## 8) Final Integrity Check

Confirm each statement:

- no pilot evidence is presented as production evidence
- no interop collaboration is presented as independent adoption
- no planned artifact is presented as delivered evidence
- requested stage matches the strongest currently verifiable evidence
