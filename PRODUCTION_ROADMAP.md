# SINT Protocol Production Roadmap

This roadmap is the operating plan for turning SINT from a broad reference stack into a production project.

The key shift is simple:

- previous roadmap:
  maximize deliverable count across many domains
- production roadmap:
  narrow the supported surface, harden it, and ship it reliably

## Goal

Reach a first production-ready release for the core enforcement path:

- capability token issuance and validation
- policy gateway enforcement
- persistence for tokens and ledger data
- evidence durability
- one stable operator / integration entrypoint

## Release Candidate Scope

The release candidate should support:

- issuing signed capability tokens
- validating tokens deterministically across process and storage boundaries
- persisting and reloading full token payloads without signature drift
- recording auditable decisions in durable storage
- exposing a documented gateway or interceptor workflow

This production roadmap also feeds the AAIF resubmission path. The foundation
feedback made the gating issue explicit: SINT must pair technical readiness with
independent production adoption, independent maintainership, and already-running
reference / conformance artifacts. The evidence roadmap is tracked in
`docs/roadmaps/aaif-resubmission-2026.md`.

The release candidate should not promise:

- every bridge package as production-supported
- every roadmap phase as complete
- full multi-domain coverage across robotics, health, smart city, and HRI at once

## Milestones

### M1. Determinism And Data Integrity

Exit criteria:

- canonical payload generation is recursively stable
- signed tokens survive JSON reordering
- persistence preserves all token fields used in signing
- targeted regression tests cover both cases

### M2. Build And CI Trust

Exit criteria:

- workspace build succeeds from clean checkout
- known flaky or broken packages are fixed or scoped out of the release candidate
- CI passes on `main`
- package-level failures are easy to localize

### M3. Supported Runtime Contract

Exit criteria:

- supported Node / pnpm / Postgres versions documented
- required env vars documented
- startup schema bootstrap is idempotent
- upgrade notes exist for persistence-affecting changes

Status:

- production gateway startup now enforces the documented durable-store and auth
  contract when `SINT_ENV=production` or `NODE_ENV=production`
- required environment variables, readiness checks, release checklist, and
  rollback notes are documented in
  `docs/guides/gateway-production-hardening.md`

### M4. Operability

Exit criteria:

- health and readiness behavior documented
- structured logs exist for core enforcement outcomes
- operator troubleshooting path exists
- one deployment topology is documented end-to-end

Status:

- `prod-lite` compose runs the gateway in production mode and probes
  `/v1/ready`, which checks the configured store and cache backends

### M5. Release Discipline

Exit criteria:

- release checklist exists
- docs build is part of release validation
- at least one end-to-end script or walkthrough is maintained
- versioning and rollback expectations are explicit

### M6. Foundation Evidence Readiness

Exit criteria:

- independent production adopters are documented separately from pilots and
  co-design partners
- at least one independent maintainer has 90+ days of sustained merge activity
- the reference gateway and conformance tooling are released before any
  foundation resubmission
- OpenSSF Best Practices work is started and gaps are public
- resubmission evidence is assembled from completed artifacts, not roadmap
  promises

### M7. Post-Quantum Crypto Agility

Exit criteria:

- token and receipt formats are crypto-agile
- unsupported mandatory PQ profiles fail closed
- hybrid Ed25519 + ML-DSA validation is available behind a verifier interface
- EvidenceLedger hash algorithms are explicit and migration-safe
- docs avoid claiming quantum resistance until a PQ verifier and release gate
  are complete

Status:

- token-level `cryptoProfile` and `postQuantumSignatures` metadata are defined
- non-classic token profiles currently fail closed with
  `UNSUPPORTED_CRYPTO_PROFILE`
- detailed migration plan lives in
  `docs/roadmaps/post-quantum-crypto-agility.md`

## Recommended Implementation Order

1. Finish data-integrity and persistence fixes.
2. Make CI and local clean-build behavior trustworthy.
3. Freeze the first supported production slice.
4. Document runtime contract and deployment.
5. Add release gates.
6. Resume feature expansion one domain at a time.

## Feature Roadmap Reframing

The existing feature roadmap is still useful, but it should be consumed through this filter:

- does it strengthen the first production slice now?
- does it directly unblock release confidence?
- does it expand surface area faster than we can support it?

If the answer to the last question is yes, it should wait.

## Near-Term Tasks

- verify the `capability-tokens` + `persistence` fixes in CI
- add an end-to-end persistence round-trip validation path
- confirm the gateway / interceptor path to present as the first supported surface
- document the release candidate topology
- add release and migration notes for token schema evolution

## After First Production Release

Once the core slice is stable, the next best expansion is the adjacent surface that reuses the same guarantees:

- operator workflows
- observability
- one additional bridge with strong tests

That keeps the project compounding from a solid base instead of widening faster than it hardens.
