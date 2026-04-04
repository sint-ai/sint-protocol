# SINT Protocol — AI Agent Guide

> This file is optimized for AI agents (LLMs) working in this codebase.
> For human contributor guidance, see CONTRIBUTING.md.
> For implementation details and pitfalls, see CLAUDE.md.

## What This Repo Does

SINT Protocol is a security enforcement layer that sits between AI agents and physical systems (robots, PLCs, drones, tool calls), ensuring every action is authorized via capability tokens, constrained to safe physical limits, and recorded in a tamper-evident audit log. It is a pnpm monorepo with 30 workspace members built on TypeScript 5.7 + Node.js 22.

## Key Invariants (Never Violate These)

1. Every authorization decision flows through `PolicyGateway.intercept()` — no bridge or route handler makes authorization decisions directly
2. Tokens are attenuation-only: `scope(child) ⊆ scope(parent)` — permissions only narrow, never expand (invariant I-T1)
3. `EvidenceLedger` is append-only and SHA-256 hash-chained — never modify or delete emitted events (invariant I-G3)
4. UUID v7 is required for `requestId` — `crypto.randomUUID()` gives v4 and WILL fail schema validation. Use `generateUUIDv7()` from `@sint/gate-capability-tokens`
5. Physical constraints live in the token, not in config files — velocity, force, geofence are enforced cryptographically
6. E-stop is unconditional — `estop` event transitions any non-terminal DFA state to ROLLEDBACK, bypassing all token checks (invariant I-G2)

## Quick Orientation

### Package Dependency Graph

```
@sint/core
  ↓
@sint/gate-capability-tokens   @sint/persistence
  ↓                               ↓
@sint/gate-evidence-ledger
  ↓
@sint/gate-policy-gateway
  ↓
@sint/bridge-*   @sint/engine-*   @sint/avatar
  ↓
@sint/gateway-server   @sint/mcp
  ↓
@sint/conformance-tests   @sint/dashboard
```

### Workspace Layout

```
packages/core/              → Shared types, Zod schemas, tier constants, DFA states
packages/capability-tokens/ → Ed25519 token issuance, delegation, revocation
packages/policy-gateway/    → THE choke point: tiers, constraints, rate limiting, M-of-N
packages/evidence-ledger/   → SHA-256 hash-chained append-only audit log
packages/bridge-*/          → Protocol adapters (MCP, ROS2, A2A, IoT, OPC-UA, MAVLink, ...)
packages/engine-*/          → AI execution layer (System1, System2, HAL, capsule sandbox)
packages/avatar/            → Behavioral identity profiles, CSML-driven tier escalation
packages/persistence/       → Storage interfaces + in-memory implementations
packages/persistence-postgres/ → PostgreSQL adapters
packages/client/            → TypeScript HTTP client for the gateway API
packages/conformance-tests/ → Security regression suite (must pass on every PR)
apps/gateway-server/        → Hono HTTP API (port 3100)
apps/sint-mcp/              → Security-first multi-MCP proxy
apps/dashboard/             → Real-time approval dashboard
sdks/typescript/            → Zero-dependency public SDK
capsules/navigation/        → Reference capsule: waypoint navigation
capsules/inspection/        → Reference capsule: visual anomaly detection
capsules/pick-and-place/    → Reference capsule: gripper control
```

### How to Run Tests

```bash
pnpm run test                                       # all 815 tests, whole workspace
pnpm --filter @sint/gate-policy-gateway test        # single package
pnpm --filter @sint/bridge-mcp test                 # single bridge
pnpm run build && pnpm run test                     # full clean run
```

### Before Starting Work

```bash
git pull --rebase
pnpm run build
pnpm run test   # must be 0 failures before you begin
```

## Multi-Agent Collaboration Rules

Several agents may work on this repo concurrently. Follow these rules:

1. **Before starting**: `git pull --rebase && pnpm run build && pnpm run test` — must be 0 failures
2. **Package ownership**: see CLAUDE.md for the package ownership table
3. **Never amend published commits** — always create new commits
4. **Test gate**: your PR/commit must maintain 0 failures on the full workspace suite (currently 1100+ tests)
5. **Base branch policy**: new PRs should target `main` unless an active release train explicitly says otherwise
6. **Branch naming**: `feat/<topic>` or `fix/<topic>` — describe what changes, not who made it
7. **No force-push to main/master** — create a PR instead
8. **PR health check**: run `gh pr list --state open` and confirm CI status before stacking related PRs

## Common Mistakes

- **UUID v4 vs v7**: `crypto.randomUUID()` produces v4. Use `generateUUIDv7()` from `@sint/gate-capability-tokens` — see CLAUDE.md "Common Name Collision Risks"
- **CircuitBreaker**: `trip()` sets `manualTrip=true` permanently preventing auto-HALF_OPEN. Use `recordDenial()` to test auto-recovery — see CLAUDE.md
- **`SintDeploymentProfile`** exists in both `policy.ts` (site profiles) and was renamed in `engine.ts` to `SintHardwareDeploymentProfile`. Do not re-add generic names in engine packages
- **Throwing errors**: All fallible operations must return `Result<T, E>` using `ok()` / `err()` helpers from `@sint/core`. Never throw or use try/catch for control flow
- **Modifying the ledger**: Evidence ledger events are immutable once written. If you need to correct a record, append a new correction event

## Entry Points

If you're asked to:

- **Add a new bridge** → create `packages/bridge-<name>/`, follow `packages/bridge-iot/` as template. Register in `apps/gateway-server/src/routes/`.
- **Add a security plugin** → see `packages/policy-gateway/src/goal-hijack.ts` as template. Plugins implement `PolicyPlugin` and are registered via `PolicyGateway` constructor.
- **Add conformance tests** → see `packages/conformance-tests/src/` for patterns. Every new security invariant should have a conformance test.
- **Add an API route** → see `apps/gateway-server/src/routes/` for patterns. Routes use Hono; all requests go through `PolicyGateway.intercept()`.
- **Add a reference capsule** → create `capsules/<name>/`, follow `capsules/navigation/` as template.
- **Add a new engine component** → see `packages/engine-system1/` (perception) or `packages/engine-system2/` (reasoning) for patterns.

## Architecture in One Paragraph

SINT Protocol implements a T0–T3 tiered authorization model where every agent request is classified into one of four tiers by consequence severity: T0 (observe/read), T1 (low-impact write), T2 (physical state change, e.g. robot movement), or T3 (irreversible/high-value commitment). All requests flow through `PolicyGateway.intercept()`, the single choke point that validates Ed25519 capability tokens, enforces physical constraints (velocity, force, geofence) embedded in the token, runs per-token rate limiting, detects forbidden action sequences, and either auto-approves T0/T1 or escalates T2/T3 to a human approval queue. Every decision is written to the `EvidenceLedger`, an append-only SHA-256 hash-chained log that provides cryptographic tamper evidence. Bridge adapters (for MCP, ROS2, MAVLink, OPC-UA, A2A, etc.) translate protocol-specific calls into `SintRequest` objects and forward them to the gateway — they never make authorization decisions themselves.

## Approval Tiers Reference

| Tier | Auto-approved? | Example actions |
|------|---------------|-----------------|
| T0 — OBSERVE | Yes (logged) | Read sensor, query DB, status check |
| T1 — PREPARE | Yes (audited) | Write file, save waypoint, stage plan |
| T2 — ACT | No — requires review | Move robot, operate gripper, `/cmd_vel` |
| T3 — COMMIT | No — requires human + M-of-N quorum | Execute trade, novel env entry, irreversible |

## Key Types (Quick Reference)

```typescript
// The request entering the gate
interface SintRequest {
  requestId: UUIDv7;          // MUST be v7 — use generateUUIDv7()
  agentId: Ed25519PublicKey;
  tokenId: UUIDv7;
  resource: string;           // "ros2:///cmd_vel" | "mcp://filesystem/*"
  action: string;             // "publish" | "call" | "subscribe"
  params: Record<string, unknown>;
  physicalContext?: { humanDetected?: boolean; currentVelocityMps?: number; currentForceNewtons?: number };
  recentActions?: string[];   // For forbidden combo detection
}

// The gateway's decision
type PolicyDecision =
  | { action: "allow"; assignedTier: ApprovalTier }
  | { action: "deny"; assignedTier: ApprovalTier; denial: { reason: string; policyViolated: string } }
  | { action: "escalate"; assignedTier: ApprovalTier; escalation: { requiredTier: string; timeoutMs: number } }
  | { action: "transform"; assignedTier: ApprovalTier; transformations: { constraintOverrides?: unknown } };
```
