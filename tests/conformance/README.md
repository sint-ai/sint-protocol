# SINT Protocol Conformance Tests

The full conformance test suite lives in [`packages/conformance-tests/`](../../packages/conformance-tests/).

## Running

```bash
pnpm install
pnpm --filter @pshkv/conformance-tests test
```

## Coverage

- Policy bundle schema validation (RFC-001)
- Capability token issuance, validation, delegation, revocation
- Policy gateway decision flow (allow / deny / escalate)
- Evidence ledger hash-chain integrity
- APS integration (agent identity resolution)
- A2A task extension field (`sint:policy`)
- Physical AI constraint enforcement (velocity, force, geofence)
- Cascade revocation across delegation trees
- MCP bridge integration
- Industrial interoperability (ROS2, MAVLink, OPC UA, MQTT/Sparkplug)

## Test fixtures

Fixtures for policy bundles, capability tokens, and ledger events are generated via:

```bash
pnpm cert:fixtures
```

See [`docs/rfc-001-policy-bundle.md`](../../docs/rfc-001-policy-bundle.md) for the normative specification.
