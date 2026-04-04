# Warehouse AMR Demo

## What this demo shows

- A2A dispatch intent enters gateway
- Open-RMF dispatch is tiered and audited
- ROS2 movement command is escalated to T2

## Run

```bash
pnpm --filter @sint/conformance-tests exec vitest run src/industrial-interoperability.test.ts
```

## Threat model focus

- Human enters aisle during planned movement
- Corridor deviation requires escalation
- Immediate revocation under active task
