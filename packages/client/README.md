# @sint/client

TypeScript SDK for the SINT Gateway API. Supports token delegation, policy queries, SSE streaming, and approval workflows.

## Install

```bash
npm install @sint/client
```

## Usage

```typescript
import { SintClient } from "@sint/client";

const client = new SintClient({
  baseUrl: "http://localhost:3100",
  apiKey: "your-api-key",
});

// Check gateway health
const health = await client.health();

// Request a policy decision
const decision = await client.intercept({
  tokenId: "tok-abc",
  resource: "file:///workspace/output.txt",
  action: "write",
});

// Stream real-time decisions via SSE
const stream = client.subscribe({ sessionId: "agent-001" });
for await (const event of stream) {
  console.log(event.type, event.decision);
}

// Delegate a token
const delegated = await client.delegate({
  parentTokenId: "tok-abc",
  delegateeDid: "did:key:z6Mk...",
  permissions: { resources: ["file:///output/**"], actions: ["read"] },
  ttlSeconds: 600,
});
```

## Part of SINT Protocol

📖 [Full documentation](https://github.com/sint-ai/sint-protocol) · 🚀 [Getting Started](https://github.com/sint-ai/sint-protocol/blob/master/docs/getting-started.md)
