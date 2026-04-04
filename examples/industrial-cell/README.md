# Industrial Cell Demo

## What this demo shows

- OPC UA read/write/call mapping to SINT actions
- Safety-critical node writes promoted to T3
- Edge gateway profile template for local T0/T1 and central T2/T3

## Run package tests

```bash
pnpm --filter @sint/bridge-opcua test
```

## Threat model focus

- Safety interlock write attempts
- Model/runtime attestation gating for T2/T3
- Emergency-stop command path and approval evidence
