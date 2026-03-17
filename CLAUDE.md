# SINT Protocol — Agent Guide

This file helps AI agents (and humans) understand and contribute to the SINT Protocol codebase.

## What is this?

SINT is a security enforcement layer for physical AI. It sits between AI agents and the physical world (robots, tool calls, actuators) ensuring every action is authorized, constrained, and audited.

## Quick Commands

```bash
pnpm install          # Install dependencies
pnpm run build        # Build all packages (required before test)
pnpm run test         # Run all 222 tests
pnpm run typecheck    # Type-check without emitting
pnpm run clean        # Remove build artifacts
```

Run a single package:
```bash
pnpm --filter @sint/gate-policy-gateway test
pnpm --filter @sint/bridge-mcp test
```

Start the gateway server:
```bash
pnpm --filter @sint/gateway-server dev
```

## Monorepo Layout

```
apps/gateway-server/     → Hono HTTP API (port 3000)
packages/core/           → Shared types, Zod schemas, tier constants
packages/capability-tokens/ → Ed25519 token issuance, delegation, validation
packages/policy-gateway/ → THE choke point: tier assignment, constraints, combos
packages/evidence-ledger/ → SHA-256 hash-chained audit log
packages/bridge-mcp/    → MCP tool call → SINT request mapping
packages/bridge-ros2/   → ROS 2 topic/service → SINT request mapping
packages/persistence/   → Storage interfaces + in-memory implementations
packages/conformance-tests/ → Security regression suite (must pass on every PR)
```

## Architecture Rules

### 1. Every action flows through PolicyGateway.intercept()
No bridge adapter, route handler, or service should make authorization decisions independently. All requests go through the gateway.

### 2. Result<T, E> — never throw
All fallible operations return `{ ok: true, value: T } | { ok: false, error: E }`. Use the `ok()` and `err()` helpers from `@sint/core`. Never use try/catch for control flow.

### 3. Attenuation only
Delegated capability tokens can only _reduce_ permissions (narrower resource, fewer actions, tighter constraints). Never escalate.

### 4. Append-only ledger
The evidence ledger is INSERT-only. Events are SHA-256 hash-chained. No updates, no deletes.

### 5. Interface-first persistence
Storage adapters implement interfaces from `@sint/persistence`. In-memory implementations are used for testing. PostgreSQL/Redis adapters are planned.

## Approval Tiers (T0–T3)

| Tier | Enum | Auto? | When |
|------|------|-------|------|
| T0 | `T0_OBSERVE` | Yes | Read-only (sensors, queries) |
| T1 | `T1_PREPARE` | Yes | Low-impact writes (save waypoint, write file) |
| T2 | `T2_ACT` | No — escalate | Physical state change (move robot, operate gripper) |
| T3 | `T3_COMMIT` | No — human required | Irreversible (exec code, transfer funds, mode change) |

Tier rules are in `packages/core/src/constants/tiers.ts`.

## Key Types

```typescript
// The request entering the gate
interface SintRequest {
  requestId: UUIDv7;
  agentId: Ed25519PublicKey;
  tokenId: UUIDv7;
  resource: string;          // "ros2:///cmd_vel" or "mcp://filesystem/writeFile"
  action: string;            // "publish", "call", "subscribe"
  params: Record<string, unknown>;
  physicalContext?: { humanDetected?, currentVelocityMps?, currentForceNewtons? };
  recentActions?: string[];  // For forbidden combo detection
}

// The gateway's decision
interface PolicyDecision {
  action: "allow" | "deny" | "escalate" | "transform";
  assignedTier: ApprovalTier;
  assignedRisk: RiskTier;
  denial?: { reason, policyViolated, suggestedAlternative? };
  escalation?: { requiredTier, reason, timeoutMs, fallbackAction };
  transformations?: { constraintOverrides?, additionalAuditFields? };
}
```

## Dependency Graph

```
@sint/core
  ↓
@sint/gate-capability-tokens   @sint/persistence
  ↓                               ↓
@sint/gate-evidence-ledger
  ↓
@sint/gate-policy-gateway
  ↓
@sint/bridge-mcp   @sint/bridge-ros2
  ↓                    ↓
@sint/gateway-server
  ↓
@sint/conformance-tests
```

## Coding Conventions

- **TypeScript strict mode** — `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`
- **ES modules** — All packages use `"type": "module"` with `.js` extensions in imports
- **Readonly by default** — Interface fields are `readonly`
- **Zod for validation** — Runtime validation at system boundaries
- **Vitest for testing** — `describe`/`it`/`expect` pattern
- **@noble for crypto** — Ed25519 signatures + SHA-256 hashing (audited, zero-dep)
- **UUIDv7 for IDs** — Sortable, timestamp-prefixed identifiers
- **ISO 8601 timestamps** — Microsecond precision (`2026-03-16T12:00:00.000000Z`)

## Adding a New Package

1. Create `packages/<name>/package.json` with `"name": "@sint/<name>"`
2. Create `packages/<name>/tsconfig.json` extending `../../tsconfig.base.json`
3. Create `packages/<name>/vitest.config.ts`
4. Create `packages/<name>/src/index.ts` with exports
5. Add `{ "path": "../<dependency>" }` to `tsconfig.json` references
6. Run `pnpm install` to link workspace dependencies

## Common Patterns

### Issuing a token
```typescript
import { generateKeypair, issueCapabilityToken } from "@sint/gate-capability-tokens";
const root = generateKeypair();
const agent = generateKeypair();
const result = issueCapabilityToken({
  issuer: root.publicKey,
  subject: agent.publicKey,
  resource: "mcp://filesystem/*",
  actions: ["call"],
  constraints: {},
  delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
  expiresAt: "2026-12-31T23:59:59.000000Z",
  revocable: true,
}, root.privateKey);
```

### Intercepting an MCP tool call
```typescript
import { MCPInterceptor } from "@sint/bridge-mcp";
const interceptor = new MCPInterceptor({ gateway });
const sessionId = interceptor.createSession({ agentId, tokenId, serverName: "filesystem" });
const result = interceptor.interceptToolCall(sessionId, {
  callId: "call-1", serverName: "filesystem", toolName: "writeFile",
  arguments: { path: "/tmp/test.txt" }, timestamp: "...",
});
// result.action === "forward" | "deny" | "escalate"
```

### Intercepting a ROS 2 publish
```typescript
import { ROS2Interceptor } from "@sint/bridge-ros2";
const interceptor = new ROS2Interceptor({ gateway, agentId, tokenId, robotMassKg: 25 });
const result = interceptor.interceptPublish({
  topicName: "/cmd_vel", messageType: "geometry_msgs/Twist",
  data: { linear: { x: 0.5, y: 0, z: 0 }, angular: { x: 0, y: 0, z: 0 } },
  timestamp: "...",
});
```

## Current Status

- **Phase 1** (complete): Security Wedge — tokens, gateway, ledger, conformance tests
- **Phase 2** (complete): Bridge adapters, approval flow, persistence interfaces, server refactor
- **Phase 3** (planned): WebSocket approvals, PostgreSQL/Redis adapters, Docker, SDK
