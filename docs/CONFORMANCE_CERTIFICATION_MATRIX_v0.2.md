# SINT v0.2 Conformance and Certification Matrix

This matrix tracks canonical fixture coverage for major interoperability paths.

| Path | Protocol Surface | Canonical Fixture | Expected Outcome |
|---|---|---|---|
| MCP tool call interception | `@sint/bridge-mcp` + gateway | `packages/conformance-tests/src/bridge-mcp-regression.test.ts` | Correct tiering, denial on invalid token, ledger evidence |
| A2A delegated task path | `@sint/bridge-a2a` + gateway | `packages/conformance-tests/src/phase4-regression.test.ts` | Unauthorized denied, physical tasks escalated |
| ROS 2 physical command path | `@sint/bridge-ros2` + gateway | `packages/conformance-tests/src/bridge-ros2-regression.test.ts` | Constraint enforcement, T2/T3 escalation deterministic |
| MQTT Sparkplug command path | `@sint/bridge-mqtt-sparkplug` + gateway | `packages/conformance-tests/src/industrial-interoperability.test.ts` | Equivalent approval behavior vs ROS2/RMF route |
| OPC UA control path | `@sint/bridge-opcua` + gateway | `packages/bridge-opcua/__tests__/opcua-resource-mapper.test.ts` | Safety-critical writes/calls elevated |
| Open-RMF dispatch path | `@sint/bridge-open-rmf` + gateway | `packages/conformance-tests/src/industrial-interoperability.test.ts` | Dispatch actions mapped to T2 escalation |
| Revocation under load | token store + gateway | `packages/conformance-tests/src/industrial-benchmark-scenarios.test.ts` | No T2/T3 fail-open after revocation |
| Stale corridor envelope | gateway execution envelope checks | `packages/conformance-tests/src/industrial-benchmark-scenarios.test.ts` | Deterministic deny on stale/mismatch corridor |

## Operational Certification Artifacts

- Discovery contract: `/.well-known/sint.json`
- Public schema catalog: `/v1/schemas`, `/v1/schemas/:name`
- OpenAPI surface: `/v1/openapi.json`
- Benchmark report outputs:
  - `docs/reports/industrial-benchmark-report.json`
  - `docs/reports/industrial-benchmark-report.md`
