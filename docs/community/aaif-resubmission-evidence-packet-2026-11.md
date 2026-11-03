# AAIF resubmission evidence packet (2026-11-02)

This packet is assembled only from artifacts already in the repository.
It is not a resubmission. Gates that are unmet stay unmet.

Truth rules for anything copied out of this page:

- do not count co-design partners as independent production adopters
- do not count a pull request as a 90-day independent maintainer
- do not list an unrun pilot as a deployment

## Shipped evidence included

- Supported topology `gateway-postgres-redis`: [Gateway Production Hardening](../guides/gateway-production-hardening.md)
- Repeatable core path: [Production Slice Verification](../guides/production-slice-verification.md)
- Signed production-slice artifact: [production-slice-validation-artifact.md](../reports/production-slice-validation-artifact.md)
- OpenSSF gap tracker, all listed rows done: [openssf-gap-tracker.md](./openssf-gap-tracker.md)
- High finding closed: [issue #209](https://github.com/sint-ai/sint-protocol/issues/209) (`fast-uri` >= 3.1.2)
- High and critical audit advisories cleared: [PR #328](https://github.com/sint-ai/sint-protocol/pull/328)
- Release gate reports: [2026-05-21](../reports/aaif-release-gate-2026-05-21.md) and [2026-08-01](../reports/aaif-release-gate-2026-08-01.md)
- Factory Action Pack demo and schemas: [factory-action-pack-demo.md](../guides/factory-action-pack-demo.md)
- External merged work, which is not adoption:
  - [PR #266](https://github.com/sint-ai/sint-protocol/pull/266) and [PR #242](https://github.com/sint-ai/sint-protocol/pull/242), nmcitra, kinetic envelope spec and vectors
  - [PR #174](https://github.com/sint-ai/sint-protocol/pull/174), ExpertVagabond, ROS 2 transport non-bypass example
  - [PR #196](https://github.com/sint-ai/sint-protocol/pull/196), peterxing, bug bounty launch plan

## CI already recorded

On `2d0cfa6` (2026-11-03), `main` CI, the docs site, the industrial benchmark
report, and Docker image publish succeeded. That run is not a schema migration
or rollback rehearsal.

## Left out on purpose

- No named production adopter. Co-design and interop are not adopters.
- No independent maintainer with 90 days of sustained merge activity.
  External merges exist in April, May, July, and October 2026. They do not
  meet that window.
- No external pilot record with a deployment date and a technical contact.
- The VLA orchestration service has not been validated in a guarded pilot.
- The RFC-001 note in [aaif-rfc001-submission-packet.md](./aaif-rfc001-submission-packet.md) is still a draft. This packet does not treat that email as sent.

## What a later resubmission still has to add

Use [the resubmission roadmap](../roadmaps/aaif-resubmission-2026.md). Gate 1
(named independent adopters) and Gate 2 (one independent maintainer over 90
days) are open. Do not file this packet as if those gates were met.
