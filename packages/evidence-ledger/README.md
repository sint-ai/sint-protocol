# @sint/gate-evidence-ledger

SHA-256 hash-chained, tamper-evident audit log for AI agent actions. Every policy decision is recorded with cryptographic integrity guarantees.

## Install

```bash
npm install @sint/gate-evidence-ledger
```

## Usage

```typescript
import { EvidenceLedger } from "@sint/gate-evidence-ledger";

const ledger = new EvidenceLedger();

// Append an entry (typically done by PolicyGateway automatically)
await ledger.append({
  sessionId: "agent-001",
  action: "write_file",
  resource: "file:///workspace/output.txt",
  decision: "allow",
  tier: 1,
  tokenId: "tok-abc",
});

// Query recent entries
const entries = await ledger.query({ sessionId: "agent-001", limit: 10 });

// Verify chain integrity — each entry's hash includes the previous hash
const integrity = await ledger.verifyChain();
console.log(integrity.valid); // true — no entries tampered
```

## Features

- **SHA-256 hash chain** — each entry includes hash of previous entry
- **Tamper detection** — broken chain = evidence of modification
- **SIEM export** — syslog, JSON-Lines, CEF output formats
- **NIST chain-of-custody** — proof receipts for compliance
- **Semantic query API** — filter by session, action, time range, tier
- **Pluggable storage** — in-memory, PostgreSQL, or custom adapters

## Part of SINT Protocol

📖 [Full documentation](https://github.com/sint-ai/sint-protocol) · 🚀 [Getting Started](https://github.com/sint-ai/sint-protocol/blob/master/docs/getting-started.md)
