# @sint/persistence

Storage interfaces and adapters for SINT Protocol. Provides in-memory implementations for development and interfaces for production adapters (PostgreSQL, Redis).

## Install

```bash
npm install @sint/persistence
```

## Usage

```typescript
import { InMemoryTokenStore, InMemoryLedgerStore } from "@sint/persistence";

// In-memory stores for development and testing
const tokenStore = new InMemoryTokenStore();
const ledgerStore = new InMemoryLedgerStore();

// Store and retrieve tokens
await tokenStore.store(capabilityToken);
const token = await tokenStore.get(tokenId);

// Store and query ledger entries
await ledgerStore.append(evidenceEntry);
const entries = await ledgerStore.query({ sessionId: "agent-001" });
```

## Adapters

| Adapter | Package | Status |
|---------|---------|--------|
| In-Memory | `@sint/persistence` | ✅ Stable |
| PostgreSQL | `@sint/persistence-postgres` | 🔧 Internal |
| Redis | Planned | — |

## Part of SINT Protocol

📖 [Full documentation](https://github.com/sint-ai/sint-protocol) · 🚀 [Getting Started](https://github.com/sint-ai/sint-protocol/blob/master/docs/getting-started.md)
