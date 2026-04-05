# SINT Memory System

The `@sint/memory` package provides operator memory with a ledger-backed audit trail. Every persistent memory write becomes a `SintLedgerEvent` — tamper-evident, auditable, and subject to retention policy.

## Architecture

```
Operator / AI Agent
       ↓
MemoryBank.store(key, value, persist=true)
       ↓                    ↓
WorkingMemory          OperatorMemory
(in-process,          (persistent, writes
 session scope)        LedgerEvent)
                            ↓
                      EvidenceLedger
                      (hash-chained)
```

## Event Types

| Event | Trigger | Retention |
|-------|---------|-----------|
| `operator.memory.stored` | `store(persist=true)` | T1: 90 days |
| `operator.memory.recalled` | `recall(query)` with results | T0: 30 days |
| `operator.memory.deleted` | `forget(key)` | T2: 180 days (tombstone) |

## Usage

```typescript
import { WorkingMemory, OperatorMemory, MemoryBank } from "@sint/memory";

const working = new WorkingMemory(500); // max 500 entries
const persistent = new OperatorMemory(ledgerWriter, agentId);
const memory = new MemoryBank(working, persistent);

// Store session-only (cleared on restart)
await memory.store("current_task", "monitoring warehouse sector 3", [], false);

// Store persistently (writes LedgerEvent)
await memory.store("operator_preference", "auto-approve T1 under 0.3m/s", ["policy"], true);

// Recall (searches both stores, persistent wins on key collision)
const results = await memory.recall("velocity preference");

// Forget (writes tombstone LedgerEvent)
await memory.forget("operator_preference");
```

## Privacy Controls

- **Working memory** is in-process only. Never written to disk or ledger. Cleared on restart.
- **Persistent memory** is written to the EvidenceLedger. Subject to GDPR right-to-erasure: `forget()` writes a tombstone record (the key is marked deleted, but the tombstone itself is retained for audit integrity per the cascade revocation spec).
- **Recall events** are logged so operators can audit what an AI agent retrieved from memory.

## Integration with Operator Interface

The SINT Operator Interface displays the last 3 recalled memories in the Context Panel. Memory writes via `sint__store_memory` (T1 tier) are visible in the Action Stream.
