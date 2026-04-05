# @sint/bridge-economy

Economic enforcement layer for SINT Protocol. Metered billing, trust-tier pricing, and balance management for agent actions.

## Install

```bash
npm install @sint/bridge-economy
```

## Usage

```typescript
import { EconomyPlugin } from "@sint/bridge-economy";

const economy = new EconomyPlugin({
  balanceAdapter: myBalanceAdapter,
  pricingAdapter: myPricingAdapter,
  trustAdapter: myTrustAdapter,
});

// Price a tool call based on tier and trust level
const price = await economy.calculatePrice({
  action: "execute_code",
  tier: 3,
  trustScore: 0.85,
});

// Check balance before execution
const canProceed = await economy.checkBalance(agentId, price);

// Debit after successful execution
await economy.debit(agentId, price, { txId: "tx-001" });
```

## Features

- **Trust-tier pricing** — higher-risk actions cost more
- **Balance management** — pre-flight balance checks
- **Pluggable adapters** — in-memory or HTTP-backed balance/pricing/trust stores
- **Ledger integration** — economic events emitted to evidence ledger

## Part of SINT Protocol

📖 [Full documentation](https://github.com/sint-ai/sint-protocol) · 🚀 [Getting Started](https://github.com/sint-ai/sint-protocol/blob/master/docs/getting-started.md)
