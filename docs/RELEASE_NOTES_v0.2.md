# SINT v0.2 Release Notes

## Highlights

- Protocol discovery and schema surfaces:
  - `GET /.well-known/sint.json`
  - `GET /v1/schemas`
  - `GET /v1/schemas/:name`
  - `GET /v1/openapi.json`
- Capability token extensions for model governance and attestation:
  - `modelConstraints`
  - `attestationRequirements`
  - `executionEnvelope`
- Request/evidence execution metadata via `executionContext`.
- Industrial interoperability bridges added:
  - `@sint/bridge-mqtt-sparkplug`
  - `@sint/bridge-opcua`
  - `@sint/bridge-open-rmf`
- SDK starters added:
  - `sdks/python/sint_client.py`
  - `sdks/go/sintclient/client.go`
- Added industrial interoperability conformance fixture:
  - `packages/conformance-tests/src/industrial-interoperability.test.ts`
- Added industrial benchmark scenario fixture set:
  - `packages/conformance-tests/src/industrial-benchmark-scenarios.test.ts`
- Added benchmark report generation and CI artifact workflow:
  - `scripts/generate-industrial-benchmark-report.mjs`
  - `.github/workflows/industrial-benchmark-report.yml`

## Deployment Profiles

- `warehouse-amr`
- `industrial-cell`
- `edge-gateway`

Policy templates for these profiles are published in `docs/profiles/`.

## Governance

- SIP process introduced:
  - `docs/SIPS.md`
  - `docs/sips/0000-template.md`
  - `docs/sips/0001-protocol-surface-v0.2.md`
