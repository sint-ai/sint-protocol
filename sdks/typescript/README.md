# @sint/sdk — TypeScript/Node.js SDK for SINT Protocol

Zero-dependency TypeScript SDK for the [SINT Protocol](../../README.md) gateway.
Works in **Node.js 18+** (native `fetch`) and modern **browsers**.

## Install

```bash
npm install @sint/sdk
# or
pnpm add @sint/sdk
```

> No runtime dependencies. `pg`, `ioredis`, etc. are not required.

## Quick Start

```typescript
import { createSintClient } from "@sint/sdk";

const sint = createSintClient({
  baseUrl: "http://localhost:3000",
  apiKey: "your-api-key",    // optional
  timeoutMs: 10_000,          // optional, default 10 s
});

// Check gateway health
const health = await sint.health();
console.log(health.status); // "ok"

// Intercept a ROS 2 publish command
const decision = await sint.intercept({
  agentId: "agent-public-key-hex",
  tokenId: "01950000-0000-7000-8000-000000000001",
  resource: "ros2:///cmd_vel",
  action: "publish",
  params: { linear: { x: 0.5, y: 0, z: 0 } },
  physicalContext: {
    currentVelocityMps: 0.3,
    humanDetected: false,
  },
});

if (decision.action === "allow") {
  // Forward the command to the robot
} else if (decision.action === "deny") {
  console.error("Denied:", decision.denial?.reason);
} else if (decision.action === "escalate") {
  console.log("Awaiting human approval:", decision.approvalRequestId);
}
```

## API Reference

### `createSintClient(config)` / `new SintClient(config)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | — | Gateway base URL |
| `apiKey` | `string` | `""` | API key (`X-API-Key` header) |
| `timeoutMs` | `number` | `10000` | Request timeout in ms |

---

### `discovery() → Promise<SintDiscovery>`

Fetches the SINT well-known discovery document at `/.well-known/sint.json`.

```typescript
const meta = await sint.discovery();
console.log(meta.name, meta.version, meta.supportedBridges.length);
```

---

### `health() → Promise<SintHealth>`

Gateway liveness/readiness endpoint.

```typescript
const { status, protocol, tokens } = await sint.health();
```

---

### `intercept(req) → Promise<SintDecision>`

The primary gate: submits one action for policy evaluation.

```typescript
const decision = await sint.intercept({
  agentId: "hex-encoded-ed25519-public-key",
  tokenId: "uuid-v7-of-capability-token",
  resource: "mcp://filesystem/writeFile",
  action: "call",
  params: { path: "/tmp/report.csv" },
  recentActions: ["readFile", "readFile"],  // for forbidden combo detection
});
```

**Decision actions:**
- `allow` — proceed
- `deny` — blocked; see `decision.denial` for reason
- `escalate` — human approval required; see `decision.escalation` and `decision.approvalRequestId`
- `transform` — proceed with modified parameters

---

### `interceptBatch(requests) → Promise<SintBatchResult[]>`

Submit multiple intercept requests in one round-trip.

```typescript
const results = await sint.interceptBatch([
  { agentId, tokenId, resource: "ros2:///camera/front", action: "subscribe" },
  { agentId, tokenId, resource: "ros2:///cmd_vel", action: "publish", params: { linear: { x: 0.2 } } },
]);
for (const result of results) {
  console.log(result.status, result.decision?.action);
}
```

---

### `pendingApprovals() → Promise<{ count: number; requests: SintPendingApproval[] }>`

Fetch all approvals waiting for operator resolution (T2/T3 escalations).

```typescript
const { count, requests } = await sint.pendingApprovals();
console.log("pending:", count);
for (const a of requests) {
  console.log(a.requestId, a.requiredTier, a.resource);
}
```

---

### `resolveApproval(requestId, resolution) → Promise<void>`

Approve or deny a pending escalation.

```typescript
await sint.resolveApproval("req-uuid", {
  status: "approved",
  by: "operator-alice",
  reason: "Confirmed safe operating conditions",
});
```

---

### `ledger(agentId?, limit?) → Promise<{ events: unknown[] }>`

Retrieve tamper-evident ledger events for audit.

```typescript
// All events (max 50)
const { events } = await sint.ledger(undefined, 50);

// Filter by agent
const { events: agentEvents } = await sint.ledger("agent-key-hex", 100);
```

---

### `schemas() → Promise<Record<string, unknown>>`

Fetch all JSON schemas served by the gateway.

---

### `schema(name) → Promise<Record<string, unknown>>`

Fetch a single schema by name.

```typescript
const schema = await sint.schema("request");
```

---

## Error Handling

All HTTP 4xx/5xx responses throw a `SintError`:

```typescript
import { SintError } from "@sint/sdk";

try {
  await sint.intercept({ /* ... */ });
} catch (e) {
  if (e instanceof SintError) {
    console.error(`SINT error ${e.status} [${e.code}]: ${e.message}`);
  }
}
```

| Property | Type | Description |
|----------|------|-------------|
| `status` | `number` | HTTP status code |
| `code` | `string` | Machine-readable error code from gateway |
| `message` | `string` | Human-readable error message |

---

## Timeout & AbortController

Every request respects `timeoutMs`. The underlying `AbortController` is handled automatically. When a request times out the native `AbortError` is thrown (not a `SintError`).

```typescript
const sint = createSintClient({ baseUrl, timeoutMs: 3_000 });
try {
  await sint.intercept({ /* ... */ });
} catch (e) {
  if (e instanceof Error && e.name === "AbortError") {
    console.error("Request timed out");
  }
}
```

---

## Build

```bash
cd sdks/typescript
npm install
npm run build   # outputs to dist/
npm test        # vitest
```
