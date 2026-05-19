# AAIF Resubmission Roadmap — 2026

This roadmap converts the AAIF review feedback into concrete project gates.

The goal is not to reword the same proposal. The goal is to make the evidence
base materially different before resubmission.

## Review Takeaway

AAIF did not reject the technical direction. The review identified a mismatch
between the proposal's Growth-stage claim and the evidence available at
submission time.

The next submission must show:

- independent production adopters outside the current co-design and interop
  network
- sustained maintainership from at least one independent organization
- reference implementation, conformance tooling, and OpenSSF readiness already
  running before submission

## Truth Constraints

These constraints keep the project credible:

- do not count co-design partners as independent production adopters
- do not count upstream engagement as production dependency
- do not count a newly listed maintainer as diverse maintainership until they
  have sustained merge activity over a visible window
- do not list roadmap items as submission evidence
- distinguish evaluation, pilot, and production deployments

## Resubmission Gates

### Gate 1. Independent Production Adoption

Target: two to three named adopters that are independent of the SINT maintainer
team and current co-design / interop cluster.

Evidence required:

- public adopter name, unless a private deployment is documented through an
  acceptable foundation-review channel
- deployment scope: gateway, interceptor, bridge, or conformance tooling
- production environment description without secrets or sensitive architecture
- date first deployed
- responsible technical contact
- short statement of why SINT is used instead of only custom policy code

Non-goals:

- GitHub stars
- issue comments
- exploratory integrations
- projects that only discussed vocabulary alignment

### Gate 2. Independent Maintainer Window

Target: at least one maintainer from a fully independent organization with 90+
days of sustained merge activity before resubmission.

Evidence required:

- `GOVERNANCE.md` maintainer ladder
- `OWNERS.md` or CODEOWNERS mapping maintainer scope
- public commits, reviews, and merged PRs across the 90-day window
- clear record that the maintainer can accept or merge work in their scope
- decision log for maintainer nomination and acceptance

Minimum bar:

- more than one cosmetic PR
- review participation on security-sensitive changes
- ownership of at least one package, bridge, conformance area, or deployment
  surface

### Gate 3. Running Reference Implementation

Target: the reference gateway is built, documented, and runnable as the first
supported production surface.

Evidence required:

- production-mode gateway startup fails closed without durable storage and auth
- Postgres token and evidence persistence documented and tested
- Redis-backed rate-limit / cache behavior documented and tested
- `/v1/ready` is the documented orchestration gate
- signed request path documented with working examples
- rollback and migration notes exist for persistence-affecting changes

Current baseline:

- `SINT_ENV=production` already enforces durable storage, Redis, API key auth,
  signed requests, and safe WebSocket auth settings
- `docs/guides/gateway-production-hardening.md` documents the deployment
  contract
- `apps/gateway-server/__tests__/production-slice.test.ts` covers the core
  HTTP path

### Gate 4. Conformance And Certification Tooling

Target: conformance checks are packaged as a repeatable artifact external users
can run against their own deployment.

Evidence required:

- command-line conformance runner
- machine-readable report output
- documented pass / fail semantics
- fixtures for token attenuation, revocation, ledger integrity, signed request
  verification, and physical constraint enforcement
- at least one external adopter or pilot user runs the tool and reports results

### Gate 5. OpenSSF And Release Readiness

Target: the project has public security and release hygiene signals before
resubmission.

Evidence required:

- OpenSSF Best Practices badge started and gaps tracked
- security policy and vulnerability reporting path verified
- release checklist used on at least one tagged release candidate
- docs build, full test suite, and conformance suite pass for that release
- SBOM or dependency review path documented for production deployments

## 90-Day Execution Plan

### Days 0-14: Reset The Public Story

Outcome: the repo stops sounding like it already satisfies foundation Growth
criteria and starts asking for the exact evidence it needs.

Tasks:

- [x] publish this roadmap
- [x] update public proposal language to separate technical maturity from adoption
  maturity
- [x] open a "production adopter program" issue template
- [x] open a "maintainer nomination" issue template
- [x] create an adopters page with explicit statuses:
  evaluation, pilot, production
- label roadmap issues with `aaif-gate/adoption`,
  `aaif-gate/maintainership`, `aaif-gate/reference-implementation`,
  `aaif-gate/conformance`, and `aaif-gate/openssf`

Exit criteria:

- no public doc claims independent production adoption unless it names the
  deployment evidence
- adoption and maintainer asks are easy for outsiders to act on

### Days 15-45: Package The Production Slice

Outcome: an external team can deploy the gateway and run a meaningful check
without private context.

Tasks:

- [x] finish a one-command production-slice verification script
- [x] document signed request examples for at least one client
- [x] harden migration and rollback docs
- [x] publish conformance runner usage
- [x] create a release candidate checklist issue for each tagged release candidate
- run OpenSSF Best Practices assessment and file gaps

Exit criteria:

- external evaluator can run gateway, issue token, intercept request, verify
  ledger proof, revoke token, and observe fail-closed behavior
- [x] OpenSSF gaps are tracked publicly

### Days 46-90: Earn Independent Evidence

Outcome: the project has visible activity from independent users and at least
one independent maintainer candidate with real responsibility.

Tasks:

- recruit independent pilot users in robotics, industrial automation, MCP
  operations, or smart infrastructure
- support pilots through public issues where possible
- convert successful pilots into named adopter records only when they are
  actually running SINT in production
- onboard one independent maintainer candidate with scoped ownership
- ensure maintainer candidate reviews and merges substantive changes over time
- hold at least two public maintainer / adopter office-hour sessions

Exit criteria:

- at least one independent maintainer candidate has started the 90-day window
- at least two independent organizations are evaluating or piloting SINT
- production adopter evidence is tracked separately from pilots

## Resubmission Checklist

Do not resubmit until all required items are true:

- [ ] two or more named independent production adopters are documented
- [ ] at least one independent maintainer has 90+ days of sustained merge
      activity
- [ ] reference gateway is built, released, and running from public docs
- [ ] conformance tooling is packaged and externally runnable
- [ ] OpenSSF Best Practices badge is started and major gaps are tracked or
      resolved
- [ ] release candidate has passed build, test, docs, and conformance gates
- [ ] proposal distinguishes co-design, interop, pilot, and production evidence
- [ ] proposal asks for the correct AAIF stage based on the evidence available
      at that time

## Evidence Dossier Template

Each resubmission evidence item should use this shape:

```text
Evidence:
  Type: production adopter | maintainer | release | conformance | security
  Organization:
  Independent from current co-design network: yes/no
  Public URL:
  Date range:
  SINT component used:
  Verification method:
  Contact or accountable owner:
  Notes:
```

Proposal assembly reference:

- `docs/community/aaif-resubmission-proposal-template.md`

## Operating Principle

The technical content can be strong before the ecosystem evidence is strong.
The next phase is about earning the external signal without overstating it.
