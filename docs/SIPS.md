# SINT Improvement Proposals (SIPs)

SIPs are the lightweight governance track for protocol evolution.

## Statuses

- `draft`
- `accepted`
- `implemented`
- `deprecated`

## Process

1. Copy `docs/sips/0000-template.md`.
2. Reserve next SIP number.
3. Define compatibility impact and migration guidance.
4. Open PR with at least one interoperability fixture when protocol surface changes.
5. Mark as `implemented` once code, docs, and conformance tests land.

## Requirements for Protocol-Surface SIPs

- clear boundary and scope
- machine-readable artifact changes (schema/openapi/well-known)
- backward-compatibility statement
- conformance test delta
- rollback/deprecation plan
