# SIP-0001: SINT Improvement Proposal Process

## Status: ACCEPTED
## Authors: SINT Core Team
## Created: 2026-04-05
## Updated: 2026-04-05

## Abstract

This SIP defines the process for proposing, reviewing, and accepting changes
to the SINT Protocol specification. All breaking changes to the token schema,
PolicyDecision format, LedgerEvent format, or bridge adapter contract require
a SIP.

## Motivation

As SINT approaches v1.0, a formal proposal process ensures:
- Breaking changes are deliberate and documented
- Community input is gathered before major decisions
- Backwards compatibility is explicitly tracked
- Ecosystem partners (APS, Guardian, ALS) can plan migrations

## SIP Types

| Type | Description | Approval Threshold |
|---|---|---|
| **Core** | Changes to token schema, PolicyDecision, LedgerEvent | 3-of-5 TSC vote |
| **Bridge** | New bridge adapter contract or existing adapter breaking change | 2-of-3 bridge maintainers |
| **Process** | Changes to SIP process itself | Simple TSC majority |
| **Informational** | Docs, guides, crosswalks (no code change) | Single author |

## SIP Lifecycle

```
Draft → Review → Last Call (14 days) → Accepted/Rejected → Final
```

- **Draft**: Author opens PR adding `docs/sip/SIP-NNNN-title.md`
- **Review**: TSC and community comment on PR (min 7 days)
- **Last Call**: No blocking objections for 14 days → moves to vote
- **Accepted**: Merged to main; implementation PRs may begin
- **Rejected**: PR closed with documented rationale

## SIP Template

Every SIP must include:
- Status, Authors, Created, Updated
- Abstract (3-5 sentences)
- Motivation (why is this change needed?)
- Specification (exact schema/API changes)
- Backwards Compatibility (what breaks, migration path)
- Reference Implementation (link to PR or package)
- Security Considerations

## Versioning

SIPs use sequential numbers (SIP-0001, SIP-0002, ...).
Protocol versions follow: SINT v{major}.{minor} where:
- **minor**: backwards-compatible additions (new event types, new bridge)
- **major**: breaking changes (token schema, PolicyDecision format)

## Technical Steering Committee (TSC)

Initial TSC composition (5 seats):
- sint-ai core team (2 seats)
- 1 seat reserved: APS / agent-passport-system
- 1 seat reserved: Guardian project
- 1 seat reserved: community elected (first election Q4 2026)

TSC decisions are recorded in `docs/tsc/` as ADRs (Architecture Decision Records).

## Current Active SIPs

| SIP | Title | Status |
|---|---|---|
| SIP-0001 | SIP Process | ACCEPTED |
| SIP-0002 | (reserved: SINT v1.0 token schema freeze) | DRAFT |
