# @sint/core

Core types, Zod schemas, and tier constants for the SINT Protocol.

## Install

```bash
npm install @sint/core
```

## Usage

```typescript
import { Tier, ActionType, type CapabilityToken, type PolicyDecision } from "@pshkv/core";

// Tier constants
console.log(Tier.T0_OBSERVE);  // Auto-approved, logged
console.log(Tier.T3_COMMIT);   // Requires human approval

// Zod schemas for runtime validation
import { CapabilityTokenSchema } from "@pshkv/core";
const parsed = CapabilityTokenSchema.parse(rawToken);
```

## Exports

- **Types** — `CapabilityToken`, `PolicyDecision`, `EvidenceEntry`, `PhysicalConstraints`
- **Schemas** — Zod schemas for all protocol types
- **Constants** — `Tier` enum, `ActionType`, tier metadata

## Part of SINT Protocol

SINT is the security, permission, and economic enforcement layer for physical AI.

📖 [Full documentation](https://github.com/sint-ai/sint-protocol) · 🚀 [Getting Started](https://github.com/sint-ai/sint-protocol/blob/master/docs/getting-started.md)
