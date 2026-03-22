# SINT Protocol
[![CI](https://github.com/sint-ai/sint-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/sint-ai/sint-protocol/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://github.com/sint-ai/sint-protocol/blob/main/LICENSE)
![Node.js >= 22](https://img.shields.io/badge/node-%3E%3D22-brightgreen)
![Tests](https://img.shields.io/badge/tests-370-brightgreen)

**Security, permission, and economic enforcement layer for physical AI.**

SINT is the missing security stack between AI agents and the physical world. Every tool call, robot command, and actuator movement flows through a single Policy Gateway that enforces capability-based permissions, graduated approval tiers, and tamper-evident audit logging.

```
Agent ──► SINT MCP Proxy ──► Policy Gateway ──► Allow / Deny / Escalate
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
- Per-server policy enforcement (maxTier ceiling, requireApproval override)
- Real-time approval dashboard with SSE streaming

## Architecture

```
┌─────────────────────────────────┐
│  Claude / Cursor / Any Client   │
│        (MCP Client)             │
└──────────┬──────────────────────┘
           │ stdio / SSE
┌──────────▼──────────────────────┐
│         SINT MCP Server         │
│  ┌───────────────────────────┐  │
│  │   Tool Aggregator         │  │  ← Discovers & merges tools from all downstreams
│  │   Policy Enforcer         │  │  ← PolicyGateway.intercept() on every call
│  │   Agent Identity          │  │  ← Ed25519 tokens, sessions, delegation
│  │   Approval Bridge         │  │  ← T2/T3 escalation via built-in tools
│  │   Audit Resources         │  │  ← Ledger exposed as MCP resources
│  └───────────────────────────┘  │
└──┬──────┬──────┬────────────────┘
   │      │      │   stdio connections
┌──▼──┐┌──▼──┐┌──▼──┐
│FS   ││Git  ││Shell│  ← Any MCP servers
│MCP  ││MCP  ││MCP  │
└─────┘└─────┘└─────┘
```

## Packages

| Package | Description | Tests |
|---------|-------------|-------|
| [`@sint/core`](packages/core) | Types, Zod schemas, tier constants | — |
| [`@sint/gate-capability-tokens`](packages/capability-tokens) | Ed25519-signed capability tokens with delegation | 31 |
| [`@sint/gate-policy-gateway`](packages/policy-gateway) | Single choke point: tier assignment, constraints, combos, approval queue | 39 |
| [`@sint/gate-evidence-ledger`](packages/evidence-ledger) | SHA-256 hash-chained append-only audit log | 29 |
| [`@sint/bridge-mcp`](packages/bridge-mcp) | MCP tool call interception and risk classification | 43 |
| [`@sint/bridge-ros2`](packages/bridge-ros2) | ROS 2 topic/service/action interception with physics extraction | 20 |
| [`@sint/persistence`](packages/persistence) | Storage interfaces + in-memory/PG/Redis implementations | 26 |
| [`@sint/client`](packages/client) | TypeScript SDK for the Gateway API | 10 |
| [`@sint/conformance-tests`](packages/conformance-tests) | Security regression suite (MCP + ROS 2 + general) | 29 |
| [`@sint/gateway-server`](apps/gateway-server) | Hono HTTP API server with approval routes + metrics | 44 |
| [`@sint/mcp`](apps/sint-mcp) | Security-first multi-MCP proxy server | 80 |
| [`@sint/dashboard`](apps/dashboard) | Real-time approval management dashboard | 19 |
| **Total** | **12 packages** | **370** |

## Quick Start

```bash
# Prerequisites: Node.js >= 22, pnpm >= 9
pnpm install
pnpm run build
pnpm run test        # 370 tests
```

### Start the Gateway Server

```bash
pnpm --filter @sint/gateway-server dev
# → http://localhost:3100/v1/health
```

### Start the Approval Dashboard

```bash
pnpm --filter @sint/dashboard dev
# → http://localhost:3201 (proxies API to gateway at :3100)
```

### Start the SINT MCP Proxy

```bash
# Create sint-mcp.config.json (see sint-mcp.config.example.json)
pnpm --filter @sint/mcp dev
# → Connects via stdio to upstream MCP client (Claude, Cursor, etc.)
```

### Docker Compose (Production)

```bash
docker-compose up
# Gateway:   http://localhost:3100
# Dashboard: http://localhost:3201
# Postgres:  localhost:5432
# Redis:     localhost:6379
```

## SINT MCP Proxy

The SINT MCP server sits between your MCP client (Claude, Cursor) and any number of downstream MCP servers. Every tool call is security-gated through the SINT PolicyGateway.

**Configuration** (`sint-mcp.config.json`):
```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "policy": { "maxTier": "T1_prepare" }
    },
    "shell": {
      "command": "npx",
      "args": ["-y", "some-shell-mcp"],
      "policy": { "maxTier": "T3_commit", "requireApproval": true }
    }
  },
  "defaultPolicy": "cautious",
  "approvalTimeoutMs": 120000
}
```

**Built-in tools** (prefixed `sint__`): `status`, `servers`, `whoami`, `pending`, `approve`, `deny`, `audit`, `add_server`, `remove_server`

**Per-server policy:**
- `maxTier` — ceiling on allowed tiers; denies calls that exceed it
- `requireApproval` — forces human approval for all non-T0 calls

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/health` | Health check |
| `POST` | `/v1/intercept` | Evaluate a single request |
| `POST` | `/v1/intercept/batch` | Evaluate multiple requests (207 Multi-Status) |
| `POST` | `/v1/tokens` | Issue a capability token |
| `POST` | `/v1/tokens/delegate` | Delegate (attenuate) a token |
| `POST` | `/v1/tokens/revoke` | Revoke a token |
| `GET` | `/v1/ledger` | Query audit ledger events |
| `GET` | `/v1/approvals/pending` | List pending approval requests |
| `POST` | `/v1/approvals/:id/resolve` | Approve or deny a request |
| `GET` | `/v1/approvals/events` | SSE stream for real-time approval events |
| `GET` | `/metrics` | Prometheus metrics |
| `POST` | `/v1/keypair` | Generate Ed25519 keypair (dev) |

## Approval Tiers

Graduated authorization mapped to physical consequence severity:

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
- Server `requireApproval: true` → all non-T0 calls escalate

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

### Approval Dashboard
Real-time web UI for managing SINT approvals:
- Live SSE-powered pending approval feed
- One-click approve/deny with operator identity
- Audit trail with hash chain integrity verification
- Overview cards: tokens, events, connection status
- Tier legend with auto/manual classification

## Project Structure

```
sint-protocol/
├── apps/
│   ├── gateway-server/           # Hono HTTP API + approval routes
│   ├── sint-mcp/                 # Multi-MCP security proxy
│   └── dashboard/                # React approval dashboard
├── packages/
│   ├── core/                     # Types, schemas, constants
│   ├── capability-tokens/        # Ed25519 token lifecycle
│   ├── policy-gateway/           # Authorization engine
│   ├── evidence-ledger/          # Hash-chained audit log
│   ├── bridge-mcp/               # MCP integration
│   ├── bridge-ros2/              # ROS 2 integration
│   ├── persistence/              # Storage (in-memory, PG, Redis)
│   ├── client/                   # TypeScript SDK
│   └── conformance-tests/        # Security regression suite
├── docker-compose.yml            # Gateway + Dashboard + PG + Redis
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
- **MCP SDK:** @modelcontextprotocol/sdk
- **Dashboard:** React 19, Vite 6, CSS custom properties
- **Testing:** Vitest (370 tests)
- **Infra:** Docker, PostgreSQL 16, Redis 7, GitHub Actions CI

## Development

```bash
pnpm run build       # Build all packages
pnpm run test        # Run all 370 tests
pnpm run typecheck   # Type-check without emitting
pnpm run clean       # Remove dist/ and build artifacts
```

### Run a single package's tests
```bash
pnpm --filter @sint/mcp test
pnpm --filter @sint/dashboard test
pnpm --filter @sint/conformance-tests test
```

## Design Principles

1. **Result\<T, E\> over exceptions** — All fallible operations return discriminated unions, never throw
2. **Interface-first persistence** — Storage adapters implement clean interfaces; swap in-memory for Postgres/Redis
3. **Single choke point** — Every agent action flows through `PolicyGateway.intercept()`
4. **Append-only audit** — The evidence ledger is INSERT-only with hash chain integrity
5. **Attenuation only** — Delegated tokens can only reduce permissions, never escalate
6. **Physical safety first** — Velocity, force, and geofence constraints are first-class citizens
7. **Per-server policy** — Each downstream MCP server can have its own security ceiling

## License

Apache-2.0
