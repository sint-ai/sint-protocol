# SINT Signed Effect Pack Profile v1

## Purpose

This profile defines a fail-closed execution boundary for SINT deployments.
Central authorization remains exclusively owned by `PolicyGateway.intercept()`.
An edge runner verifies that authorization and applies stricter local controls
immediately before an effect reaches hardware or another protected system.

## Security Invariants

- **I-E1 Pack integrity:** Any change to a signed effect pack invalidates its
  digest or signature and prevents execution.
- **I-E2 Dispatch confinement:** A dispatch is short-lived, single-use, and
  cryptographically bound to one runner, one pack digest, and one effect.
- **I-E3 Constraint continuity:** The edge runner revalidates the original
  capability token, including physical constraints, at execution time.
- **I-E4 Local sovereignty:** Local admission may deny centrally authorized
  effects, but it may never upgrade or approve a denied or escalated request.
- **I-E5 Evidence continuity:** Strong-tier dispatches can require both policy
  and approval event hashes. Runner lifecycle records form an append-only local
  SHA-256 hash chain.
- **I-E6 No ambient execution:** Effect contracts describe typed effects.
  Hardware adapters are injected executors; manifests do not provide a raw
  shell capability.

## Effect Pack

An effect pack contains:

- Stable pack identity and version
- Issuer identity and optional expiry
- Typed effect identifiers
- SINT resource and action bindings
- Minimum approval tier
- Parameter types, bounds, patterns, and enumerations
- Bindings from effect parameters to token-enforced velocity, force, position,
  and human-presence checks
- Effect classification
- Duration and output limits
- Optional output redaction patterns

The pack digest is SHA-256 over canonical JSON. The issuer signs the digest with
Ed25519.

## Dispatch Envelope

A dispatch envelope binds:

- UUID v7 dispatch and request identifiers
- Stable action reference
- Target runner
- Pack identity and digest
- Effect and exact parameters
- Original signed SINT capability token
- `allow` or `transform` gateway decision
- Assigned tier and policy evidence hash
- Optional approval evidence hash
- Physical action context
- Issuance, expiry, nonce, and gateway signer

The gateway signer signs canonical JSON for the complete payload.

## Local Admission

The edge operator can restrict trusted issuers, gateway signers, capability
issuers, pack digests, effect identifiers, maximum tier, and tiers requiring
approval evidence. These controls only narrow authority.

## Execution Evidence

The local journal records dispatch acceptance or denial, execution start, and a
terminal completed, failed, or cancelled state. Output is redacted and limited
before being included in the returned receipt.
