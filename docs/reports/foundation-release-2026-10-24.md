# Foundation release completion — 24 October 2026

Scope: PR [#270](https://github.com/sint-ai/sint-protocol/pull/270). This completes
the code and local review of the predictive broker, VLA proposal contracts,
provenance, consequence limits and evidence-review surfaces in that PR. The user
requested completion and merging without a paid OhMyBug re-hunt. No cloud
attestation or independent third-party validation is claimed.

## Review closure

The previous recheck retained the 11 original fixes, fixed four inline GitHub
findings, repaired SQL policy preservation, and passed CI at `cfff3ee`.

The completion pass also reviewed the GitHub review body, which contained an
additional human-authority authentication finding. That default gate now requires
an operator-configured `resolveHumanAuthorityProof`; supplied metadata must match
the current authenticated record in full. Token and proof application/resource/
action/value bounds are enforced, future observations are rejected, and proof
freshness and validity windows are rechecked after lookup. Provider errors and
timeouts fail closed through the audited plugin path.

Additional foundation fixes:

- Signed hazardous-energy and online-adaptation restrictions previously had no
  execution enforcement. Requests using these tokens now deny explicitly.
- Token-bound VLA transition limits cannot yet be supplied securely to the
  broker. Such chunks now deny explicitly; velocity, acceleration and jerk
  declarations cannot be omitted when a token limits them.
- OpenPI rejects insecure runtime endpoint configuration and invalid response
  timestamps before constructing a proposal.
- The consumer-media bridge returns `Result` errors for malformed identifiers,
  unknown operations/classes and missing required fields, before calling the gateway.

## Supported boundary and remaining roadmap

The release provides policy, evidence, storage and proposal/broker foundations.
Custom trust resolvers and the OpenPI authenticated channel are deployment
dependencies, not built-in integrations with a live identity or GPU service.
Broker stream sequencing is local to a single instance; each stream requires
one owner. Deploy PostgreSQL migration 008 before storing the new token policies.

Hazardous-energy actuation, online adaptation, a guarded hardware pilot, a
production OpenPI transport/GPU service and the planned VLA metrics dashboard
remain future work. Their absence does not imply execution authority: unsupported
signed enforcement contracts fail closed. Existing roadmap pilot checkboxes remain
open, and no production/hardware validation is claimed for those paths.

The pre-existing Matter and Home Assistant bridge packages skip build,
typecheck and tests; the health bridge skips build/typecheck. They remain
prototypes and are excluded from supported-release claims. Workspace task totals
include those scripted exemptions. Service-dependent tests filtered by Turbo are
run by the separate PostgreSQL/Redis integration gate, which rejects skips.

## Validation

Final build/typecheck/test, fixture certification, documentation and explicit
service integration results are recorded in the PR's validation section and
GitHub check runs. The release conformance lane includes authenticated human
proof forgery/revocation/scope/freshness tests and unsupported-contract denial
tests. The earlier [recheck report](./predictive-bugfix-recheck-2026-10-24.md)
records the original fix inventory and baseline evidence.

Local completion results:

- Frozen install, build, typecheck and full workspace verification passed:
  3,117 Vitest cases passed; the 9 integration-gate validator tests passed.
- Explicit isolated PostgreSQL 17/Redis gate: 93 cases passed, zero skipped.
- Fixture certification, onboarding/public-facts contracts and docs build passed.
- The new foundation release conformance file has 25 cases; OpenPI has 8 cases,
  and the consumer-media package has 4 cases.
