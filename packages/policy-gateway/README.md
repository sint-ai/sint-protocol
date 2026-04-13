# @sint/gate-policy-gateway

Single enforcement choke point for AI agent actions. Every tool call, robot command, and actuator movement flows through the Policy Gateway.

## Install

```bash
npm install @sint/gate-policy-gateway
```

## Usage

```typescript
import { PolicyGateway } from "@pshkv/gate-policy-gateway";
import { Tier } from "@pshkv/core";

const gateway = new PolicyGateway({
  tokenResolver: async (tokenId) => lookupToken(tokenId),
  rules: [
    { match: { actions: ["read"] }, tier: Tier.T0_OBSERVE, approve: "auto" },
    { match: { actions: ["write"] }, tier: Tier.T1_PREPARE, approve: "auto" },
    { match: { actions: ["execute"] }, tier: Tier.T3_COMMIT, approve: "human" },
  ],
});

// Intercept an action
const decision = await gateway.intercept({
  tokenId: "token-123",
  resource: "file:///workspace/output.txt",
  action: "write",
});

console.log(decision.action);  // "allow" | "deny" | "escalate"
console.log(decision.tier);    // Tier.T1_PREPARE
```

## Features

- **5-tier approval model** — T0 (observe) through T4 (critical)
- **Tier assignment** — automatic classification based on action + resource
- **Physical constraints** — velocity, force, geofence enforcement
- **Forbidden combos** — detect dangerous action sequences
- **Circuit breaker** — automatic lockout on repeated violations
- **Per-server policy** — maxTier ceiling, requireApproval override
- **Goal hijack detection** — identify manipulation attempts
- **Supply chain verification** — validate tool provenance
- **Memory integrity** — detect context tampering

## Part of SINT Protocol

📖 [Full documentation](https://github.com/sint-ai/sint-protocol) · 🚀 [Getting Started](https://github.com/sint-ai/sint-protocol/blob/master/docs/getting-started.md)
