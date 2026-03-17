# SINT Protocol

**Security, permission, and economic enforcement layer for physical AI.**

SINT is the missing security stack between AI agents and the physical world. Every tool call, robot command, and actuator movement flows through a single Policy Gateway that enforces capability-based permissions, graduated approval tiers, and tamper-evident audit logging.

```
Agent ──► Bridge (MCP/ROS2) ──► Policy Gateway ──► Allow / Deny / Escalate
                                      │
                              Evidence Ledger (hash-chained)
```

## Why SINT?

AI agents can now control robots, execute code, move money, and operate machinery. But there's no standard security layer between "the LLM decided to do X" and "X happened in the physical world." SINT is that layer.

**Core guarantees:**
- No agent action ever bypasses the Policy Gateway
- Every decision is recorded in a tamper-evident hash-chained ledger
- Physical constraints (velocity, force, geofence) are enforced at the protocol level
- Dangerous action sequences are detected and blocked (forbidden combos)
- Graduated approval tiers match authorization to physical consequence severity

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    SINT Protocol                     │
├──────────┬──────────┬──────────┬──────────┬─────────┤
│ L1       │ L2       │ L3       │ L4       │ L5      │
│ Bridge   │ Gate     │ Engine   │ Economy  │ Avatar  │
│          │          │          │          │         │
│ MCP ◄────┤ Policy   │ (future) │ (future) │(future) │
│ ROS 2 ◄──┤ Gateway  │          │          │         │
│          │ Tokens   │          │          │         │
│          │ Ledger   │          │          │         │
└──────────┴──────────┴──────────┴──────────┴─────────┘
```

**Implemented (Phase 1+2):** L1 Bridge + L2 Gate

## Packages

| Package | Description | Tests |
|---------|-------------|-------|
| [`@sint/core`](packages/core) | Types, Zod schemas, tier constants | — |
| [`@sint/gate-capability-tokens`](packages/capability-tokens) | Ed25519-signed capability tokens with delegation | 31 |
| [`@sint/gate-policy-gateway`](packages/policy-gateway) | Single choke point: tier assignment, constraints, combos, approval queue | 39 |
| [`@sint/gate-evidence-ledger`](packages/evidence-ledger) | SHA-256 hash-chained append-only audit log | 29 |
| [`@sint/bridge-mcp`](packages/bridge-mcp) | MCP tool call interception and risk classification | 37 |
| [`@sint/bridge-ros2`](packages/bridge-ros2) | ROS 2 topic/service/action interception with physics extraction | 20 |
| [`@sint/persistence`](packages/persistence) | Storage interfaces + in-memory implementations | 26 |
| [`@sint/conformance-tests`](packages/conformance-tests) | Security regression suite (MCP + ROS 2 + general) | 29 |
| [`@sint/gateway-server`](apps/gateway-server) | Hono HTTP API server | 11 |
| **Total** | | **222** |

## Quick Start

```bash
# Prerequisites: Node.js >= 22, pnpm >= 9
pnpm install
pnpm run build
pnpm run test        # 222 tests
```

### Start the Gateway Server

```bash
pnpm --filter @sint/gateway-server dev
# → http://localhost:3000/v1/health
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/health` | Health check |
| `POST` | `/v1/intercept` | Evaluate a single request |
| `POST` | `/v1/intercept/batch` | Evaluate multiple requests (207 Multi-Status) |
| `POST` | `/v1/tokens` | Issue a capability token |
| `POST` | `/v1/tokens/delegate` | Delegate (attenuate) a token |
| `POST` | `/v1/tokens/revoke` | Revoke a token |
| `GET` | `/v1/ledger` | Query audit ledger events |
| `POST` | `/v1/keypair` | Generate Ed25519 keypair (dev) |

### Example: Intercept a Tool Call

```bash
# 1. Generate a keypair
curl -s -X POST http://localhost:3000/v1/keypair | jq

# 2. Issue a token (use the keys from step 1)
curl -s -X POST http://localhost:3000/v1/tokens \
  -H "Content-Type: application/json" \
  -d '{
    "request": {
      "issuer": "<ROOT_PUBLIC_KEY>",
      "subject": "<AGENT_PUBLIC_KEY>",
      "resource": "mcp://filesystem/readFile",
      "actions": ["call"],
      "constraints": {},
      "delegationChain": {"parentTokenId": null, "depth": 0, "attenuated": false},
      "expiresAt": "2026-12-31T23:59:59.000000Z",
      "revocable": true
    },
    "privateKey": "<ROOT_PRIVATE_KEY>"
  }' | jq

# 3. Intercept a request
curl -s -X POST http://localhost:3000/v1/intercept \
  -H "Content-Type: application/json" \
  -d '{
    "requestId": "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
    "timestamp": "2026-03-16T00:00:00.000000Z",
    "agentId": "<AGENT_PUBLIC_KEY>",
    "tokenId": "<TOKEN_ID>",
    "resource": "mcp://filesystem/readFile",
    "action": "call",
    "params": {"path": "/tmp/test.txt"}
  }' | jq
```

## Approval Tiers

The core innovation — graduated authorization mapped to physical consequence severity:

| Tier | Name | Auto-approved? | Example |
|------|------|---------------|---------|
| **T0** | OBSERVE | Yes (logged) | Read sensor data, query database |
| **T1** | PREPARE | Yes (audited) | Write file, save waypoint |
| **T2** | ACT | Requires review | Move robot, operate gripper |
| **T3** | COMMIT | Requires human | Execute code, transfer funds, mode change |

Tier escalation triggers:
- Human detected near robot → T2 escalates to T3
- New/untrusted agent → tier escalates by one level
- Forbidden action sequence detected → T3 required

## Key Concepts

### Capability Tokens
Ed25519-signed permissions with:
- **Resource scoping** — what the agent can access (`ros2:///cmd_vel`, `mcp://filesystem/*`)
- **Action restriction** — what operations are allowed (`publish`, `call`, `subscribe`)
- **Physical constraints** — max velocity, max force, geofence polygon
- **Delegation chains** — max 3 hops, attenuation only (can't escalate permissions)
- **Revocation** — instant invalidation via revocation store

### Forbidden Combinations
Dangerous action sequences that are detected and blocked:
- `filesystem.write` → `exec.run` (code injection)
- `credential.read` → `http.request` (credential exfiltration)
- `database.write` → `database.execute` (SQL injection escalation)

### Evidence Ledger
Every policy decision is recorded in a SHA-256 hash-chained append-only log:
- Tamper-evident — any modification breaks the chain
- Proof receipts — cryptographic proof of any specific decision
- Queryable — filter by agent, event type, time range

## Project Structure

```
sint-protocol/
├── apps/
│   └── gateway-server/        # Hono HTTP API
│       ├── src/
│       │   ├── server.ts      # App factory (testable)
│       │   ├── middleware.ts   # CORS, request IDs, errors
│       │   └── routes/        # health, intercept, tokens, ledger
│       └── __tests__/         # E2E API tests
├── packages/
│   ├── core/                  # Types, schemas, constants
│   │   └── src/
│   │       ├── types/         # policy, capability-token, ledger, primitives
│   │       ├── schemas/       # Zod validation schemas
│   │       └── constants/     # Tier rules, forbidden combos
│   ├── capability-tokens/     # Token lifecycle
│   │   └── src/
│   │       ├── issuer.ts      # Issue tokens
│   │       ├── validator.ts   # Validate signatures + expiry
│   │       ├── delegator.ts   # Delegate with attenuation
│   │       └── revocation.ts  # Revocation store
│   ├── policy-gateway/        # Authorization engine
│   │   └── src/
│   │       ├── gateway.ts     # Main intercept logic
│   │       ├── tier-assigner.ts
│   │       ├── constraint-checker.ts
│   │       ├── forbidden-combos.ts
│   │       └── approval-flow.ts
│   ├── evidence-ledger/       # Audit log
│   │   └── src/
│   │       ├── writer.ts      # Append events
│   │       ├── reader.ts      # Query events
│   │       └── proof-receipt.ts
│   ├── bridge-mcp/            # MCP integration
│   │   └── src/
│   │       ├── mcp-interceptor.ts
│   │       ├── mcp-session.ts
│   │       └── mcp-resource-mapper.ts
│   ├── bridge-ros2/           # ROS 2 integration
│   │   └── src/
│   │       ├── ros2-interceptor.ts
│   │       ├── ros2-resource-mapper.ts
│   │       ├── ros2-message-types.ts  # Zod schemas for Twist, Wrench, etc.
│   │       └── ros2-qos.ts
│   ├── persistence/           # Storage layer
│   │   └── src/
│   │       ├── interfaces.ts  # LedgerStore, TokenStore, RevocationBus, CacheStore
│   │       └── in-memory-*.ts # In-memory implementations
│   └── conformance-tests/     # Security regression suite
│       └── src/
│           ├── security-regression.test.ts
│           ├── bridge-mcp-regression.test.ts
│           └── bridge-ros2-regression.test.ts
├── package.json
├── turbo.json
├── tsconfig.base.json
└── pnpm-workspace.yaml
```

## Tech Stack

- **Runtime:** Node.js 22+
- **Language:** TypeScript 5.7 (strict mode)
- **Monorepo:** pnpm workspaces + Turborepo
- **HTTP:** Hono
- **Validation:** Zod
- **Crypto:** @noble/ed25519, @noble/hashes (audited, zero-dependency)
- **Testing:** Vitest

## Development

```bash
pnpm run build       # Build all packages
pnpm run test        # Run all 222 tests
pnpm run typecheck   # Type-check without emitting
pnpm run clean       # Remove dist/ and build artifacts
```

### Run a single package's tests
```bash
pnpm --filter @sint/gate-policy-gateway test
pnpm --filter @sint/bridge-mcp test
pnpm --filter @sint/conformance-tests test
```

## Design Principles

1. **Result\<T, E\> over exceptions** — All fallible operations return discriminated unions, never throw
2. **Interface-first persistence** — Storage adapters implement clean interfaces; swap in-memory for Postgres/Redis
3. **Single choke point** — Every agent action flows through `PolicyGateway.intercept()`
4. **Append-only audit** — The evidence ledger is INSERT-only with hash chain integrity
5. **Attenuation only** — Delegated tokens can only reduce permissions, never escalate
6. **Physical safety first** — Velocity, force, and geofence constraints are first-class citizens

## License

Apache-2.0
