# OPC UA Adapter Profile

Status: active profile.

Policy resource:

```text
opcua://*/**
```

The OPC UA profile covers PLC and industrial asset command surfaces represented
as SINT resource URIs. It is the first non-robot-specific path in the
industrial pack, useful for safety interlocks, PLC methods, and cell-level
state changes.

Implementation references:

- `packages/bridge-opcua/src/opcua-resource-mapper.ts`
- `packages/conformance-tests/src/industrial-cell-safety-pack-conformance.test.ts`
