# SINT Protocol

**An open protocol for AI agent orchestration, security, and governance.**

SINT Protocol is the missing infrastructure layer between "assign work to an AI agent" and "get reliable, auditable, governed results." It enables organizations to hire, manage, coordinate, and govern autonomous AI agents through structured task management, heartbeat-based execution, and a security enforcement gateway that ensures every agent action is authorized, constrained, and audited.

```
Agent ──► SINT MCP Proxy ──► Policy Gateway ──► Allow / Deny / Escalate
                                    │
                            Evidence Ledger (hash-chained)
```

---

## Why SINT Protocol?

AI agents are moving from demos to production. Organizations now run dozens of autonomous agents across engineering, research, operations, and support. But deploying them at scale exposes a fundamental gap: **there is no standard way to manage AI agents as a workforce.**

Today, every team builds ad-hoc solutions for:
- Knowing whether an agent is working or has stalled
- Preventing two agents from stepping on each other's work
- Routing approvals and enforcing budget limits
- Tracing what an agent did, why, and who authorized it
- Ensuring no agent action bypasses security gates
- Coordinating multi-agent workflows across teams

**Existing protocols address adjacent problems but leave orchestration unsolved:**
- **MCP** (Anthropic) standardizes tool access — how agents call tools — but not how agents coordinate with each other or how organizations manage agent workforces.
- **A2A** (Google) standardizes bilateral agent messaging but lacks higher-level orchestration: task graphs, organizational hierarchies, budget enforcement, and multi-agent workflow coordination.
- **Frameworks** (AutoGen, CrewAI, LangGraph) provide multi-agent capabilities but are language-specific, framework-locked, and cannot interoperate across implementations.

SINT Protocol defines the orchestration + security layer that sits above MCP and A2A, composing with them rather than competing.

---

## Key Concepts

### Heartbeats

Agents operate on a **heartbeat cycle**: wake, check for assigned work, execute a unit of progress, report status, sleep. This pattern makes agent liveness observable, enables stall detection, and creates natural checkpoints for governance review.

```
┌─────────┐     ┌──────────┐     ┌─────────┐     ┌──────────┐
│  WAKE   │────>│  CHECK   │────>│ EXECUTE │────>│  REPORT  │──┐
│         │     │  WORK    │     │  STEP   │     │  STATUS  │  │
└─────────┘     └──────────┘     └─────────┘     └──────────┘  │
     ^                                                          │
     └──────────────────── SLEEP ◄──────────────────────────────┘
```

### Task Checkout

Tasks are **checked out** to agents with exclusive locks, preventing concurrent modification. Checkouts expire if heartbeats stop, enabling automatic recovery from agent failures.

### Chain of Command

Every agent operates within a **chain of command** — a hierarchy that determines who can assign work, approve actions, and override decisions. Approval requirements escalate based on risk, cost, and impact.

### Graduated Approval Tiers (T0–T3)

Authorization mapped to consequence severity:

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

### Capability Tokens

Ed25519-signed permissions with resource scoping, action restriction, physical constraints (velocity, force, geofence), delegation chains (max 3 hops, attenuation only), and instant revocation.

### Forbidden Combinations

Pattern detection across tool sequences that blocks dangerous action chains:
- `filesystem.write` → `exec.run` (code injection)
- `credential.read` → `http.request` (credential exfiltration)
- `database.write` → `database.execute` (SQL injection escalation)

### Evidence Ledger

Every policy decision is recorded in a SHA-256 hash-chained append-only log. Tamper-evident, with cryptographic proof receipts, queryable by agent, event type, and time range.

---

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

---

## Quick Start

```bash
# Prerequisites: Node.js >= 22, pnpm >= 9
git clone https://github.com/sint-ai/sint-protocol.git
cd sint-protocol
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

---

## Use Cases

- **Autonomous software development** — Assign coding tasks to AI agents with PR approval gates, budget limits on compute, and delegation to specialized agents (testing, security review, documentation).

- **Multi-agent research workflows** — Coordinate a team of research agents that divide a complex question, work in parallel with checkout-based coordination, and synthesize results under human supervision.

- **Managed business operations** — Deploy agents for customer support, data processing, or content generation with chain-of-command oversight, billing code tracking, and audit trails for compliance.

- **Physical AI safety** — Gate robot commands, actuator movements, and real-world actions through graduated approval tiers with physical constraints (velocity, force, geofence) enforced at the protocol level.

---

## Project Status

SINT Protocol is in **alpha**. The core security primitives — capability tokens, policy gateway, evidence ledger, and bridge adapters — are implemented and tested (370+ tests). The task management, heartbeat, and checkout layers are under active development.

**What works today:**
- Policy gateway with graduated approval tiers (T0–T3)
- Ed25519 capability tokens with delegation chains
- Hash-chained evidence ledger with proof receipts
- MCP and ROS 2 bridge adapters
- Real-time approval dashboard
- Gateway HTTP API with Prometheus metrics
- Multi-MCP security proxy (works with Claude, Cursor, any MCP client)
- Docker Compose production deployment

**What is coming:**
- Heartbeat-based agent lifecycle management
- Task queue with checkout and concurrency control
- Budget management and billing code enforcement
- Cross-team delegation protocols
- WebSocket approvals and PostgreSQL/Redis persistence adapters
- Agent pool management and load balancing

See [ROADMAP.md](ROADMAP.md) for detailed milestones.

We welcome early adopters, feedback, and contributions. The protocol is evolving and your input shapes it.

---

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

---

## Design Principles

1. **Protocol, not framework** — Any language, any runtime, any agent system can implement SINT
2. **Result\<T, E\> over exceptions** — All fallible operations return discriminated unions, never throw
3. **Single choke point** — Every agent action flows through `PolicyGateway.intercept()`
4. **Append-only audit** — The evidence ledger is INSERT-only with hash chain integrity
5. **Attenuation only** — Delegated tokens can only reduce permissions, never escalate
6. **Physical safety first** — Velocity, force, and geofence constraints are first-class citizens
7. **Interface-first persistence** — Storage adapters implement clean interfaces; swap in-memory for Postgres/Redis

---

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

---

## Contributing

We welcome contributions of all kinds — bug fixes, tests, documentation, bridge adapters, and protocol improvements. See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code standards, and the PR process.

Look for issues labeled [`good first issue`](https://github.com/sint-ai/sint-protocol/labels/good%20first%20issue) to get started.

---

## License

Apache-2.0 — see [LICENSE](LICENSE) for details.
