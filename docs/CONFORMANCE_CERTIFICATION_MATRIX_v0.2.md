# SINT v0.2 Conformance and Certification Matrix

This matrix tracks canonical fixture coverage for major interoperability paths.

| Path | Protocol Surface | Canonical Fixture | Validation Test | Expected Outcome |
|---|---|---|---|---|
| MCP tool call interception | `@sint/bridge-mcp` + gateway | `packages/conformance-tests/src/bridge-mcp-regression.test.ts` | `packages/conformance-tests/src/bridge-mcp-regression.test.ts` | Correct tiering, denial on invalid token, ledger evidence |
| A2A delegated task path | `@sint/bridge-a2a` + gateway | `packages/conformance-tests/src/phase4-regression.test.ts` | `packages/conformance-tests/src/phase4-regression.test.ts` | Unauthorized denied, physical tasks escalated |
| ROS 2 physical command path | `@sint/bridge-ros2` + gateway | `packages/conformance-tests/src/bridge-ros2-regression.test.ts` | `packages/conformance-tests/src/bridge-ros2-regression.test.ts` | Constraint enforcement, T2/T3 escalation deterministic |
| MQTT Sparkplug command path | `@sint/bridge-mqtt-sparkplug` + gateway | `packages/conformance-tests/fixtures/industrial/warehouse-move-equivalence.v1.json` | `packages/conformance-tests/src/canonical-fixtures-conformance.test.ts` | Equivalent approval behavior vs ROS2/RMF route |
| OPC UA control path | `@sint/bridge-opcua` + gateway | `packages/conformance-tests/fixtures/industrial/opcua-safety-control.v1.json` | `packages/conformance-tests/src/canonical-fixtures-conformance.test.ts` | Safety-critical writes/calls elevated |
| Open-RMF dispatch path | `@sint/bridge-open-rmf` + gateway | `packages/conformance-tests/fixtures/industrial/warehouse-move-equivalence.v1.json` | `packages/conformance-tests/src/canonical-fixtures-conformance.test.ts` | Dispatch actions mapped to T2 escalation |
| Hardware safety-controller handshake | gateway + industrial execution metadata | `packages/conformance-tests/fixtures/industrial/hardware-safety-handshake.v1.json` | `packages/conformance-tests/src/canonical-fixtures-conformance.test.ts`, `packages/policy-gateway/__tests__/gateway.test.ts` | Industrial T2/T3 paths fail-closed on missing/denied permit; estop preempts execution; safety anomalies are evidence-visible |
| Revocation under load | token store + gateway | `packages/conformance-tests/src/industrial-benchmark-scenarios.test.ts` | `packages/conformance-tests/src/industrial-benchmark-scenarios.test.ts` | No T2/T3 fail-open after revocation |
| Stale corridor envelope | gateway execution envelope checks | `packages/conformance-tests/src/industrial-benchmark-scenarios.test.ts` | `packages/conformance-tests/src/industrial-benchmark-scenarios.test.ts` | Deterministic deny on stale/mismatch corridor |
| Safety-zone breach | geofence + constraint checker | `packages/conformance-tests/src/industrial-benchmark-scenarios.test.ts` | `packages/conformance-tests/src/industrial-benchmark-scenarios.test.ts` | Deterministic deny when crossing safety boundary |
| Model swap guardrail | token `modelConstraints` + request runtime model metadata | `packages/conformance-tests/src/industrial-benchmark-scenarios.test.ts` | `packages/conformance-tests/src/industrial-benchmark-scenarios.test.ts` | Deny on non-allowlisted runtime model |
| Multi-fleet conflict | Open-RMF `override` + quorum escalation | `packages/conformance-tests/src/industrial-benchmark-scenarios.test.ts` | `packages/conformance-tests/src/industrial-benchmark-scenarios.test.ts` | T3 escalation with attached approval quorum |
| Edge central-control fail-closed | edge control-plane hooks + gateway | `packages/conformance-tests/src/edge-mode-conformance.test.ts` | `packages/conformance-tests/src/edge-mode-conformance.test.ts` | T0/T1 local pass; T2/T3 denied offline, escalated online |
| v0 client compatibility | token/request gateway path | `packages/conformance-tests/src/backward-compatibility-v0-clients.test.ts` | `packages/conformance-tests/src/backward-compatibility-v0-clients.test.ts` | Legacy payloads remain valid without new optional fields |
| TypeScript SDK gateway contract | `@sint/sdk` + gateway REST | `packages/conformance-tests/fixtures/protocol/well-known-sint.v0.2.example.json`, `packages/conformance-tests/fixtures/industrial/warehouse-move-equivalence.v1.json` | `sdks/typescript/src/__tests__/client.test.ts` | Request metadata generation, header contract, and endpoint payloads stay in sync with v0.2 |
| PostgreSQL persistence adapter contract | `@sint/persistence-postgres` | `packages/conformance-tests/fixtures/persistence/postgres-adapter-cert.v1.json` | `packages/persistence-postgres/src/__tests__/certification-fixtures.test.ts` | Ledger chain mapping, revocation checks, and rate-limit increments are deterministic |
| ASI04 supply-chain runtime verification | `@sint/gate-policy-gateway` (`DefaultSupplyChainVerifier`) | `packages/conformance-tests/fixtures/security/supply-chain-verification.v1.json` | `packages/conformance-tests/src/security-iot-fixtures-conformance.test.ts` | Fingerprint/allowlist mismatch is denied pre-execution; bridge mismatch emits warning and remains fail-safe |
| MQTT IoT session fail-closed forwarding | `@sint/bridge-iot` + gateway | `packages/conformance-tests/fixtures/iot/mqtt-gateway-session.v1.json` | `packages/conformance-tests/src/security-iot-fixtures-conformance.test.ts`, `packages/bridge-iot/__tests__/mqtt-session.test.ts` | T2/T3 pre-approval paths are blocked from execution; only `allow` forwards publish/subscribe |
| Verifiable compute critical-action gate | token + request proof metadata + gateway verifier hook | `packages/conformance-tests/fixtures/security/verifiable-compute-critical-actions.v1.json` | `packages/conformance-tests/src/security-iot-fixtures-conformance.test.ts`, `packages/policy-gateway/__tests__/gateway.test.ts` | Missing/stale proofs deny deterministically; valid proofs proceed to normal T2/T3 escalation flow |
| Tier compliance crosswalk contract | core constants + discovery route | `packages/conformance-tests/fixtures/protocol/tier-compliance-crosswalk.v1.json` | `packages/conformance-tests/src/canonical-fixtures-conformance.test.ts`, `packages/core/__tests__/compliance-crosswalk.test.ts` | One-to-one tier mapping to NIST AI RMF / ISO 42001 / EU AI Act remains machine-readable and stable |
| Economic routing + optional x402 quoting | `@sint/bridge-economy` + `/v1/economy/route` | `packages/conformance-tests/fixtures/economy/cost-aware-routing.v1.json` | `packages/conformance-tests/src/economy-fixtures-conformance.test.ts`, `apps/gateway-server/__tests__/economy.test.ts`, `packages/bridge-economy/__tests__/cost-aware-routing.test.ts` | Budget/latency-aware route selection is deterministic; x402 quote path is optional and backward-compatible |
| AgentSkill delegated-authority boundary | gateway + capability token validation | `packages/conformance-tests/fixtures/interop/agentskill-delegated-authority.v1.json` | `packages/conformance-tests/src/agentskill-authz-fixtures-conformance.test.ts` | Subject/scope binding enforced; revocation+expiry TOCTOU fail-closed; required attestation denial deterministic |
| `action_ref` identity equivalence + explainability | cross-engine governance comparability profile | `packages/conformance-tests/fixtures/interop/action-ref-explainability.v1.json` | `packages/conformance-tests/src/action-ref-explainability-conformance.test.ts` | Same request identity yields stable `action_ref`; verdict divergence requires complete machine-readable decision context |
| Economic Layer payment governance | budget + settlement safety profile | `packages/conformance-tests/fixtures/economy/payment-governance.v1.json` | `packages/conformance-tests/src/payment-governance-fixtures-conformance.test.ts` | Daily/rolling caps, recipient allowlist, receipt replay rejection, and reserve/commit mismatch checks are deterministic |
| Standalone certification execution | `@sint/sintctl` certify command | N/A (executes canonical fixture pack) | `apps/sintctl/src/certification.ts`, `apps/sintctl/__tests__/certification.test.ts` | External operators can run one command and produce machine-readable certification summary evidence |

## Operational Certification Artifacts

- Discovery contract: `/.well-known/sint.json`
- Public schema catalog: `/v1/schemas`, `/v1/schemas/:name`
- OpenAPI surface: `/v1/openapi.json`
- Benchmark report outputs:
  - `docs/reports/industrial-benchmark-report.json`
  - `docs/reports/industrial-benchmark-report.md`
  - `docs/reports/ros2-control-loop-benchmark.md`

## Canonical Fixture Pack (v0.2)

- Warehouse cross-bridge equivalence fixture:
  - `packages/conformance-tests/fixtures/industrial/warehouse-move-equivalence.v1.json`
- OPC UA industrial-cell safety fixture:
  - `packages/conformance-tests/fixtures/industrial/opcua-safety-control.v1.json`
- Hardware safety-controller handshake fixture:
  - `packages/conformance-tests/fixtures/industrial/hardware-safety-handshake.v1.json`
- Well-known discovery contract fixture:
  - `packages/conformance-tests/fixtures/protocol/well-known-sint.v0.2.example.json`
- Tier compliance crosswalk fixture:
  - `packages/conformance-tests/fixtures/protocol/tier-compliance-crosswalk.v1.json`
- PostgreSQL persistence adapter fixture:
  - `packages/conformance-tests/fixtures/persistence/postgres-adapter-cert.v1.json`
- Supply-chain runtime verification fixture:
  - `packages/conformance-tests/fixtures/security/supply-chain-verification.v1.json`
- Verifiable compute critical-action fixture:
  - `packages/conformance-tests/fixtures/security/verifiable-compute-critical-actions.v1.json`
- Economic routing + x402 fixture:
  - `packages/conformance-tests/fixtures/economy/cost-aware-routing.v1.json`
- AgentSkill delegated-authority fixture:
  - `packages/conformance-tests/fixtures/interop/agentskill-delegated-authority.v1.json`
- `action_ref` identity/explainability fixture:
  - `packages/conformance-tests/fixtures/interop/action-ref-explainability.v1.json`
- Payment governance fixture:
  - `packages/conformance-tests/fixtures/economy/payment-governance.v1.json`
- MQTT session certification fixture:
  - `packages/conformance-tests/fixtures/iot/mqtt-gateway-session.v1.json`
- Executable fixture conformance gate:
  - `pnpm --filter @sint/conformance-tests run test:fixtures`
  - `node apps/sintctl/dist/cli.js certify run`
  - `pnpm --filter @sint/bridge-iot run test:fixtures`
  - `pnpm --filter @sint/sdk run test:contracts`
  - `pnpm --filter @sint/persistence-postgres run test:fixtures`
- Certification bundle generator:
  - `pnpm run cert:bundle`
  - outputs:
    - `docs/reports/certification-bundle-summary.json`
    - `docs/reports/certification-bundle-summary.md`
