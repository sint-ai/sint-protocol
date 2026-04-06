# ADR-0001: Establish Technical Steering Committee and SIP Process

- **Date**: 2026-04-05
- **Status**: Accepted
- **Decision Makers**: SINT Core Team (@pshkv)

## Context

As SINT Protocol moves toward v1.0 and begins attracting ecosystem partners
(APS, Guardian, ALS) and external contributors, ad-hoc decisions made by
the core team alone are no longer sufficient. Breaking changes to the token
schema, PolicyDecision format, LedgerEvent format, or bridge adapter contracts
need a deliberate, transparent, and community-visible process.

The project already has a conformance test suite, a published specification
(SINT_v0.2_SPEC.md), and a WHITEPAPER. Governance formalization is the
logical next step before a v1.0 stability commitment.

## Decision

1. Establish a **Technical Steering Committee (TSC)** with 5 seats:
   - 2 seats: sint-ai core team
   - 1 seat reserved: APS / agent-passport-system
   - 1 seat reserved: Guardian project
   - 1 seat reserved: community-elected (first election Q4 2026)

2. Adopt the **SINT Improvement Proposal (SIP)** process, documented in
   `docs/sip/SIP-0001-process.md`, as the required mechanism for all
   protocol-breaking changes.

3. Record all TSC decisions as ADRs under `docs/tsc/`.

4. Publish community governance docs at `docs/community/governance.md`.

## Consequences

- All breaking changes to core protocol types now require a SIP and TSC vote
  before implementation may begin.
- Day-to-day pull requests (non-breaking additions, bug fixes, docs) continue
  under the existing two-LGTM maintainer merge policy.
- Security issues continue to bypass the SIP process; they are handled via
  coordinated disclosure (see SECURITY.md).
- Ecosystem partners have a defined channel (GitHub Discussions RFCs) to
  propose changes and a predictable timeline (14-day Last Call) before any
  breaking change is merged.
- The community-elected seat creates a path for external contributors to gain
  formal governance participation by Q4 2026.
