# SIP-0001: Public Protocol Surface v0.2

- Status: implemented
- Authors: SINT maintainers
- Created: 2026-04-04
- Updated: 2026-04-04

## Summary

Defines the SINT v0.2 public interoperability surface, discovery endpoints, stable nouns, and additive token/request extensions for runtime model and attestation governance.

## Scope

- discovery endpoints (`/.well-known/sint.json`, schema catalog, OpenAPI)
- frozen public nouns for external integration
- optional token fields (`modelConstraints`, `attestationRequirements`, `executionEnvelope`)
- optional request execution metadata (`executionContext`)
- industrial bridge/profile publication for `mqtt-sparkplug`, `opcua`, and `open-rmf`

## Compatibility

Backward compatible. Older clients without new optional fields continue to operate unchanged.

## Conformance

Implemented with interoperability fixture:

- `packages/conformance-tests/src/industrial-interoperability.test.ts`
