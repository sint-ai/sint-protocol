# SINT v0.2 Release Notes

## Highlights

- Protocol discovery and schema surfaces:
  - `GET /.well-known/sint.json`
  - `GET /v1/schemas`
  - `GET /v1/schemas/:name`
  - `GET /v1/openapi.json`
  - `GET /v1/compliance/tier-crosswalk`
- Capability token extensions for model governance and attestation:
  - `modelConstraints`
  - `attestationRequirements`
  - `verifiableComputeRequirements`
  - `executionEnvelope`
  - `constraints.quorum`
- Request/evidence execution metadata via `executionContext`.
- Tier crosswalk contract added for compliance alignment:
  - NIST AI RMF / ISO/IEC 42001 / EU AI Act mappings at each SINT tier
  - machine-readable schema: `tier-compliance-crosswalk`
- Verifiable compute critical-action hooks:
  - request metadata: `executionContext.verifiableCompute`
  - fail-closed tier checks for proof presence/type/freshness/public-input hashes
  - optional verifier plugin contract in PolicyGateway
- Hardware safety-controller handshake hooks:
  - request metadata: `executionContext.hardwareSafety`
  - industrial profile fail-closed checks for permit/interlock freshness
  - estop preemption for all tiers
  - safety evidence emission on estop/permit/interlock anomaly paths
  - explicit safety evidence taxonomy:
    - `safety.hardware.permit.denied`
    - `safety.hardware.interlock.open`
    - `safety.hardware.state.stale`
- Economic Layer v1 routing upgrades:
  - `selectCostAwareRoute()` and optional `applyX402Quotes()` in `@sint/bridge-economy`
  - `POST /v1/economy/route` endpoint for budget/latency-aware path selection
- Edge control-plane hooks for split deployments:
  - central escalation gating for T2/T3 (`EDGE_CENTRAL_UNAVAILABLE` fail-closed behavior)
  - revocation relay hook
  - evidence replication hook
- Avatar/CSML escalation is now enabled by default in gateway server contexts.
- Industrial interoperability bridges added:
  - `@sint/bridge-mqtt-sparkplug`
  - `@sint/bridge-opcua`
  - `@sint/bridge-open-rmf`
- SDK starters added:
  - `sdks/python/sint_client.py`
  - `sdks/go/sintclient/client.go`
  - `sdks/typescript` (`@sint/sdk`) contract-aligned with gateway v0.2
- Added industrial interoperability conformance fixture:
  - `packages/conformance-tests/src/industrial-interoperability.test.ts`
- Added industrial benchmark scenario fixture set:
  - `packages/conformance-tests/src/industrial-benchmark-scenarios.test.ts`
- Added canonical industrial certification fixtures:
  - `packages/conformance-tests/fixtures/industrial/warehouse-move-equivalence.v1.json`
  - `packages/conformance-tests/fixtures/industrial/opcua-safety-control.v1.json`
  - `packages/conformance-tests/fixtures/industrial/hardware-safety-handshake.v1.json`
  - `packages/conformance-tests/src/canonical-fixtures-conformance.test.ts`
- Added protocol/persistence certification fixtures:
  - `packages/conformance-tests/fixtures/protocol/well-known-sint.v0.2.example.json`
  - `packages/conformance-tests/fixtures/persistence/postgres-adapter-cert.v1.json`
  - `packages/persistence-postgres/src/__tests__/certification-fixtures.test.ts`
- Added security/IoT certification fixtures:
  - `packages/conformance-tests/fixtures/security/supply-chain-verification.v1.json`
  - `packages/conformance-tests/fixtures/iot/mqtt-gateway-session.v1.json`
  - `packages/conformance-tests/src/security-iot-fixtures-conformance.test.ts`
- Added economy routing certification fixture:
  - `packages/conformance-tests/fixtures/economy/cost-aware-routing.v1.json`
  - `packages/conformance-tests/src/economy-fixtures-conformance.test.ts`
- Hardened `@sint/bridge-iot` session semantics:
  - MQTT publish/subscribe now execute only on gateway `allow`
  - T2/T3 `escalate` responses are fail-closed until approval resolution
- Added edge and compatibility conformance fixtures:
  - `packages/conformance-tests/src/edge-mode-conformance.test.ts`
  - `packages/conformance-tests/src/backward-compatibility-v0-clients.test.ts`
- Added benchmark report generation and CI artifact workflow:
  - `scripts/generate-industrial-benchmark-report.mjs`
  - `.github/workflows/industrial-benchmark-report.yml`
- Added one-command certification bundle generator:
  - `scripts/generate-certification-bundle.mjs`
  - `pnpm run cert:bundle`
  - outputs `docs/reports/certification-bundle-summary.{json,md}`
- Added ROS2 control-loop SLA benchmark tooling:
  - `packages/conformance-tests/src/ros2-control-loop-latency.test.ts`
  - `scripts/generate-ros2-control-loop-report.mjs`
  - `docs/reports/ros2-control-loop-benchmark.md`
- Added hardware safety-controller integration roadmap:
  - `docs/roadmaps/hardware-safety-controller-integration.md`

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
