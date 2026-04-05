# SINT Protocol
[![CI](https://github.com/sint-ai/sint-protocol/actions/workflows/ci.yml/badge.svg)](https://github.com/sint-ai/sint-protocol/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://github.com/sint-ai/sint-protocol/blob/main/LICENSE)
![Node.js >= 22](https://img.shields.io/badge/node-%3E%3D22-brightgreen)
![Tests](https://img.shields.io/badge/tests-370-brightgreen)

![Tests](https://img.shields.io/badge/tests-815%20passing-brightgreen)
![Node.js](https://img.shields.io/badge/node-%3E%3D22-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)
![License](https://img.shields.io/badge/license-Apache--2.0-blue)

**Formally specified security, permission, and economic enforcement layer for physical AI.**

SINT is the missing governance layer between AI agents and the physical world. Every tool call, robot command, and actuator movement flows through a single Policy Gateway that enforces capability-based permissions, graduated approval tiers, and tamper-evident audit logging.

> **Academic grounding:** SINT is formally specified against IEC 62443 FR1–FR7, EU AI Act Article 13, and NIST AI RMF. The formal specification and evaluation framework reference the ROSClaw empirical safety study ([arXiv:2603.26997](https://arxiv.org/abs/2603.26997)) and MCP security analysis ([arXiv:2601.17549](https://arxiv.org/abs/2601.17549)).

```
Agent ──► SINT Bridge ──► Policy Gateway ──► Allow / Deny / Escalate
                               │
                       Evidence Ledger (SHA-256 hash-chained)
                               │
                    TEE ProofReceipt (Intel SGX / ARM TrustZone)
```

## Why SINT?

AI agents can now control robots, execute code, move money, and operate machinery. But there's no standard security layer between "the LLM decided to do X" and "X happened in the physical world."

**The empirical case for SINT:**
- **ROSClaw (IROS 2026):** Up to 4.8× spread in out-of-policy LLM action proposals across frontier models under identical safety envelopes. The 3.4× divergence between frontier backends is measurable, reproducible, and persistent.
- **MCP security (arXiv:2601.17549):** 10 documented real-world MCP breaches in under 8 months, including a CVSS 9.6 command injection affecting 437,000 downloads.
- **SROS2:** Formally demonstrated to contain 4 critical vulnerabilities at ACM CCS 2022, including access-control bypasses permitting arbitrary command injection.
- **Unitree BLE worm (September 2025):** Hardcoded crypto keys enabled wormable BLE/Wi-Fi command injection across robot fleets — precisely the scenario SINT's per-agent token scoping and real-time revocation prevent.

**Core guarantees:**
- No agent action ever bypasses the Policy Gateway (invariant I-G1: No Bypass)
- Every decision is recorded in a tamper-evident SHA-256 hash-chained ledger (invariant I-G3: Ledger Primacy)
- Physical constraints (velocity, force, geofence) are enforced at the protocol level — in the token, not in config
- Tier-gated verifiable compute hooks support provable-execution evidence on critical actions
- E-stop is universal across all non-terminal DFA states (invariant I-G2: E-stop Universality)
- Per-agent capability tokens with real-time revocation

## Quick Start

```bash
# Prerequisites: Node.js >= 22, pnpm >= 9
pnpm install
pnpm run build
pnpm run test        # 815 passing tests across 30 workspace members
```

### Start the Gateway Server

```bash
pnpm --filter @sint/gateway-server dev
# → http://localhost:3100/v1/health
# → http://localhost:3100/v1/ready
```

### Start Production-Like Stacks (One Command)

```bash
pnpm run stack:dev
pnpm run stack:edge
pnpm run stack:prod-lite
```

Compose profiles:
- [`docker/compose/dev.yml`](docker/compose/dev.yml)
- [`docker/compose/edge.yml`](docker/compose/edge.yml)
- [`docker/compose/prod-lite.yml`](docker/compose/prod-lite.yml)

### Run a Single Package

```bash
pnpm --filter @sint/gate-policy-gateway test
pnpm --filter @sint/bridge-mcp test
```

## For AI Agents

If you are an AI agent (Claude, GPT, Gemini, Cursor, etc.) working in this repo, read **[AGENTS.md](AGENTS.md)** first. It covers key invariants, common mistakes, and entry points for the most common tasks. For deeper implementation details, see **[CLAUDE.md](CLAUDE.md)**.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  AI Agents / Foundation Models                               │
│  (Claude, GPT, Gemini, open-source)                         │
└──────────────────┬───────────────────────────────────────────┘
                   │
┌──────────────────▼───────────────────────────────────────────┐
│  SINT Bridge Layer (L1)                                      │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐  │
│  │ bridge-mcp │ │ bridge-ros2│ │ bridge-a2a │ │ bridge-  │  │
│  │ MCP tools  │ │ ROS topics │ │ Google A2A │ │ open-rmf │  │
│  └────────────┘ └────────────┘ └────────────┘ └──────────┘  │
│  ┌──────────────────────┐ ┌───────────────────────────────┐  │
│  │ bridge-mqtt-sparkplug│ │ bridge-opcua                  │  │
│  │ Industrial IoT       │ │ PLC / OT control plane bridge │  │
│  └──────────────────────┘ └───────────────────────────────┘  │
│  Per-resource state: UNREGISTERED→PENDING_AUTH→AUTHORIZED    │
│  →ACTIVE→SUSPENDED (real-time revocation without restart)    │
└──────────────────┬───────────────────────────────────────────┘
                   │ SintRequest (UUIDv7, Ed25519, resource, action, physicalContext)
┌──────────────────▼───────────────────────────────────────────┐
│  SINT Gate (L2) — THE choke point                           │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │  PolicyGateway.intercept()                              │ │
│  │  1. Schema validation (Zod)                             │ │
│  │  2. Token validation (Ed25519 + expiry + revocation)    │ │
│  │  3. Resource scope check                                │ │
│  │  4. Per-token rate limiting (sliding window)            │ │
│  │  5. Physical constraint enforcement                     │ │
│  │  6. Forbidden action sequence detection                 │ │
│  │  7. Tier assignment: max(BaseTier, Δ_human, Δ_trust...) │ │
│  │  8. T2/T3 → escalate to approval queue                 │ │
│  │  9. T0/T1 + approved T2/T3 → allow                     │ │
│  │  10. Bill via EconomyPlugin (if configured)             │ │
│  └─────────────────────────────────────────────────────────┘ │
│                          ↓                                   │
│  EvidenceLedger (SHA-256 hash chain + TEE ProofReceipt)     │
└──────────────────────────────────────────────────────────────┘
```

### APS vs SINT Primitives

| APS Concept | SINT Implementation |
|-------------|-------------------|
| Principal | `agentId` (Ed25519 public key) + W3C DID identity |
| Capability | `SintCapabilityToken` (Ed25519-signed, scoped, attenuatable) |
| Authority | `PolicyGateway.intercept()` — single choke point |
| Confinement | Per-token resource scope + physical constraints (velocity, force, geofence) |
| Revocation | `RevocationStore` + ConsentPass endpoint (real-time) |
| Audit | `EvidenceLedger` — append-only, SHA-256 hash-chained |

## Packages

### Gate (Security Core)

| Package | Description | Tests |
|---------|-------------|-------|
| [`@sint/core`](packages/core) | Types, Zod schemas, tier constants, formal DFA states | — |
| [`@sint/gate-capability-tokens`](packages/capability-tokens) | Ed25519 tokens, delegation, W3C DID identity | 55 |
| [`@sint/gate-policy-gateway`](packages/policy-gateway) | Authorization engine: tiers, constraints, rate limiting, M-of-N quorum | 152 |
| [`@sint/gate-evidence-ledger`](packages/evidence-ledger) | SHA-256 hash-chained append-only audit log with TEE attestation | 45 |

### Bridges (12 bridges)

| Package | Description | Tests |
|---------|-------------|-------|
| [`@sint/bridge-mcp`](packages/bridge-mcp) | MCP tool call interception and risk classification | 66 |
| [`@sint/bridge-ros2`](packages/bridge-ros2) | ROS 2 topic/service/action interception with physics extraction | 20 |
| [`@sint/bridge-a2a`](packages/bridge-a2a) | Google A2A Protocol bridge for multi-agent coordination | 38 |
| [`@sint/bridge-iot`](packages/bridge-iot) | Generic MQTT/CoAP edge IoT bridge with gateway session interception | 21 |
| [`@sint/bridge-mqtt-sparkplug`](packages/bridge-mqtt-sparkplug) | MQTT Sparkplug profile mapping with industrial command tiering defaults | 8 |
| [`@sint/bridge-opcua`](packages/bridge-opcua) | OPC UA node/method mapping with safety-critical write/call promotion | 6 |
| [`@sint/bridge-open-rmf`](packages/bridge-open-rmf) | Open-RMF fleet/facility mapping for warehouse dispatch workflows | 5 |
| [`@sint/bridge-grpc`](packages/bridge-grpc) | gRPC service/method profile mapping with default tier assignment | 5 |
| [`@sint/bridge-economy`](packages/bridge-economy) | Economy bridge: balance, budget, trust, billing ports | 47 |
| [`@sint/bridge-mavlink`](packages/bridge-mavlink) | MAVLink drone/UAV command bridge | 15 |
| [`@sint/bridge-swarm`](packages/bridge-swarm) | Multi-robot swarm coordination bridge | 9 |

### Engine (AI Execution Layer)

| Package | Description | Tests |
|---------|-------------|-------|
| [`@sint/engine-system1`](packages/engine-system1) | Neural perception: sensor fusion, ONNX inference, anomaly detection | 42 |
| [`@sint/engine-system2`](packages/engine-system2) | Symbolic reasoning: behavior trees, task planning, System 1/2 arbitration | 86 |
| [`@sint/engine-hal`](packages/engine-hal) | Hardware Abstraction Layer: auto-detect hardware, select deployment profile | 26 |
| [`@sint/engine-capsule-sandbox`](packages/engine-capsule-sandbox) | WASM/TS capsule loading, validation, and sandboxed execution | 36 |
| [`@sint/avatar`](packages/avatar) | Avatar Layer (L5): behavioral identity profiles, CSML-driven tier escalation | 25 |

### Reference Capsules

| Package | Description | Tests |
|---------|-------------|-------|
| [`@sint/capsule-navigation`](capsules/navigation) | Waypoint following navigation reference capsule | 11 |
| [`@sint/capsule-inspection`](capsules/inspection) | Visual anomaly detection for manufacturing QA | 8 |
| [`@sint/capsule-pick-and-place`](capsules/pick-and-place) | Gripper control for pick-and-place tasks | 12 |

### Persistence

| Package | Description | Tests |
|---------|-------------|-------|
| [`@sint/persistence`](packages/persistence) | Storage interfaces + in-memory/PG/Redis implementations | 26 |
| [`@sint/persistence-postgres`](packages/persistence-postgres) | Production PostgreSQL adapters for ledger, revocation, and rate-limit durability | 14 |

### Apps & SDKs

| Package | Description | Tests |
|---------|-------------|-------|
| [`@sint/gateway-server`](apps/gateway-server) | Hono HTTP API with approvals, SSE streaming, A2A routes | — |
| [`@sint/mcp`](apps/sint-mcp) | Security-first multi-MCP proxy server | — |
| [`@sint/dashboard`](apps/dashboard) | Real-time approval dashboard with operator auth | 29 |
| [`@sint/client`](packages/client) | TypeScript SDK for the Gateway API (delegation, SSE) | — |
| [`@sint/sdk`](sdks/typescript) | Zero-dependency public TypeScript SDK aligned to gateway v0.2 contracts | 9 |
| [`@sint/conformance-tests`](packages/conformance-tests) | Security regression suite — all phases | — |

**Total: 30 workspace members, 815 passing tests**

## Approval Tiers

Graduated authorization mapped to physical consequence severity:

| Tier | Name | DFA States | Auto-approved? | Example |
|------|------|------------|---------------|---------|
| **T0** | OBSERVE | → OBSERVING | Yes (logged) | Read sensor data, query database |
| **T1** | PREPARE | → PREPARING | Yes (audited) | Write file, save waypoint, stage plan |
| **T2** | ACT | ESCALATING → ACTING | Requires review | Move robot, operate gripper, publish `/cmd_vel` |
| **T3** | COMMIT | ESCALATING → COMMITTING | Requires human + optional M-of-N | Execute trade, novel environment entry, irreversible action |

Tier escalation triggers (Δ factors):
- `Δ_human`: Human presence sensor active in workspace → +1 tier
- `Δ_trust`: Agent trust score below threshold or recent failures → +1 tier
- `Δ_env`: Robot near physical boundary or unstructured environment → +1 tier
- `Δ_novelty`: Action outside validated distribution (novelty detector) → +1 tier

## Formal Specification

### Request Lifecycle DFA

SINT models every request as a deterministic finite automaton with 12 states:

```
IDLE → PENDING → POLICY_EVAL → PLANNING → OBSERVING/PREPARING/ACTING → COMMITTING → COMPLETED
                     ↓                              ↓
                ESCALATING                      ROLLEDBACK  (estop, execution failure)
                     ↓
                  FAILED     (approval denied, timeout)
```

The **ACTING** state is only reachable via POLICY_EVAL with a valid token. Physical actuation is structurally impossible without a valid capability token.

### Tier Assignment Function

```
Tier(r) = max(BaseTier(r), Δ_human(r), Δ_trust(r), Δ_env(r), Δ_novelty(r))
```

### Formal Invariants

| Invariant | Description |
|-----------|-------------|
| **I-T1** (Attenuation) | `scope(child_token) ⊆ scope(parent_token)` — delegation can only reduce permissions |
| **I-T2** (Unforgeability) | Capability tokens are Ed25519-signed; valid tokens are computationally unforgeable |
| **I-T3** (Physical Constraint Primacy) | Physical constraints (velocity, force, geofence) in a token cannot be weakened by any downstream layer |
| **I-G1** (No Bypass) | Physical actuation is only reachable from the ACTING DFA state, which is only reachable via POLICY_EVAL |
| **I-G2** (E-stop Universality) | The `estop` event transitions any non-terminal state to ROLLEDBACK unconditionally |
| **I-G3** (Ledger Primacy) | COMMITTING → COMPLETED requires `ledger_committed`; no action completes without a ledger record |

## Benchmark Results

PolicyGateway latency (measured on M3 MacBook Pro, pnpm run bench):

| Tier | p50 | p99 |
|------|-----|-----|
| T0 (OBSERVE) | ~1ms | ~3ms |
| T1 (PREPARE) | ~1ms | ~3ms |
| T2 (ACT) | ~1ms | ~3ms |
| T3 (COMMIT) | ~1ms | ~3ms |

The gateway adds sub-3ms overhead at p99 for all tiers. Run benchmarks: `pnpm run bench`.

ROS2 control-loop target benchmark:

| Path | SLA Target | Command |
|------|------------|---------|
| ROS2 command path (`/cmd_vel`) | `p99 < 10ms` | `pnpm run benchmark:ros2-loop` |

Industrial benchmark artifacts:
- [`docs/reports/industrial-benchmark-report.md`](docs/reports/industrial-benchmark-report.md)
- [`docs/reports/ros2-control-loop-benchmark.md`](docs/reports/ros2-control-loop-benchmark.md)

Compliance mapping assets:
- [`docs/compliance/tier-crosswalk-pack.md`](docs/compliance/tier-crosswalk-pack.md)

## Key Concepts

### Capability Tokens

Ed25519-signed capability tokens — the *only* authorization primitive. Unlike RBAC (ambient authority to principals), OCap requires explicit token presentation for every operation.

Token fields:
- **Resource scoping** — what the agent can access (`ros2:///cmd_vel`, `mcp://filesystem/*`, `a2a://agents.example.com/*`)
- **Action restriction** — what operations are allowed (`publish`, `call`, `subscribe`, `a2a.send`)
- **Physical constraints** — max velocity (m/s), max force (N), geofence polygon, time window, rate limit
- **Verifiable compute requirements** — optional proof type/verifier/freshness/public-input constraints for T2/T3 actions
- **Delegation chains** — max 3 hops, attenuation only (invariant I-T1)
- **Revocation** — instant invalidation via revocation store (ConsentPass endpoint)
- **W3C DID identity** — `did:key:z6Mk...` format for agent portability

### Evidence Ledger

Every policy decision is recorded in a SHA-256 hash-chained append-only log. Chain integrity: `ℓ_k.previousHash = SHA256(canonical(ℓ_{k-1}))`. A gap or hash mismatch constitutes tamper evidence.

**Retention policy:**

| Tier | Retention |
|------|-----------|
| T0 (OBSERVE) | 30 days |
| T1 (PREPARE) | 90 days |
| T2 (ACT) | 180 days |
| T3 (COMMIT) | 365 days (indefinite if legal hold) |

### CSML: Composite Safety-Model Latency

A deployment metric that fuses behavioral and physical safety dimensions:

```
CSML(m, p, t) = α·AR_m + β·BP_m + γ·SV_m - δ·CR_m + ε·𝟙[ledger_intact(t)]
```

CSML above a deployment threshold θ automatically escalates all subsequent requests from that model backend to the next tier.

## Compliance Mapping

### IEC 62443 FR1–FR7

| FR | Title | SINT Mechanism |
|----|-------|----------------|
| FR1 | Identification & Authentication | SintCapabilityToken with Ed25519 agent identity; W3C DID portability |
| FR2 | Use Control | Four-tier Approval Gate; `maxRepetitions` constraint; per-resource action allowlists |
| FR3 | System Integrity | SHA-256 hash-chained Evidence Ledger; TEE ProofReceipt for T2/T3 |
| FR4 | Data Confidentiality | Zenoh TLS transport; capability scope prevents sensor access without explicit token |
| FR5 | Restricted Data Flow | Policy Gateway allowlists; `geofence` constraint; SINT Bridge per-topic DFA |
| FR6 | Timely Response | `safety.estop.triggered` event; E-stop universality invariant I-G2 |
| FR7 | Resource Availability | Per-token rate limiting; `maxRepetitions`; budget enforcement in capsule sandbox |

### EU AI Act Article 13

| Requirement | SINT Approach |
|-------------|---------------|
| Logging and traceability | SHA-256 hash-chained Evidence Ledger — tamper detection is cryptographic |
| Human oversight | Dynamic Consent + T3 approval gate — T3 actions cannot execute without recorded human approval |
| Risk management | Tier escalation based on real-time physical context (Δ_human, Δ_env, Δ_novelty) |

### Tier Crosswalk (NIST AI RMF / ISO 42001 / EU AI Act)

| SINT Tier | NIST AI RMF | ISO/IEC 42001 | EU AI Act |
|-----------|-------------|---------------|------------|
| T0 Observe | MAP + MEASURE + MANAGE monitoring controls | Clause 9 + Clause 8 controls | Article 12 + Article 13 |
| T1 Prepare | GOVERN + MANAGE controlled write path | Clause 8.1/8.2 operational risk treatment | Article 9 + Article 12 |
| T2 Act | MANAGE risk response with accountable oversight | Clause 8 + Clause 6 operational controls | Article 14 + Article 15 |
| T3 Commit | Highest-consequence GOVERN + MANAGE controls | Clause 8.3 + Clause 10 corrective governance | Article 14(4)(e) + Articles 9/12/15 |

Machine-readable crosswalk endpoint: `GET /v1/compliance/tier-crosswalk`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/.well-known/sint.json` | Public protocol discovery (version, bridges, profiles, schemas) |
| `GET` | `/v1/health` | Health check |
| `POST` | `/v1/intercept` | Evaluate a single request |
| `POST` | `/v1/intercept/batch` | Evaluate multiple requests (207 Multi-Status) |
| `POST` | `/v1/tokens` | Issue a capability token |
| `POST` | `/v1/tokens/delegate` | Delegate (attenuate) a token |
| `POST` | `/v1/tokens/revoke` | Revoke a token |
| `GET` | `/v1/ledger` | Query audit ledger events |
| `GET` | `/v1/approvals/pending` | List pending approval requests |
| `POST` | `/v1/approvals/:id/resolve` | Approve or deny a request (M-of-N quorum) |
| `GET` | `/v1/approvals/events` | SSE stream for real-time approval events |
| `GET` | `/v1/approvals/ws` | WebSocket stream for low-latency approval events |
| `POST` | `/v1/a2a` | JSON-RPC 2.0 A2A protocol endpoint |
| `GET` | `/v1/metrics` | Prometheus metrics |
| `GET` | `/v1/openapi.json` | OpenAPI surface for gateway integration |
| `GET` | `/v1/compliance/tier-crosswalk` | SINT tier mapping to NIST AI RMF / ISO 42001 / EU AI Act controls |
| `POST` | `/v1/economy/route` | Cost-aware route selection with optional x402 pay-per-call quotes |

## Development Phases

| Phase | Description | Tests |
|-------|-------------|-------|
| **Phase 1** (complete) | Security Wedge — capability tokens, PolicyGateway, EvidenceLedger | 425 |
| **Phase 2** (complete) | Engine Core — bridge-mcp, bridge-ros2, engine packages, persistence, gateway-server | +221 (646) |
| **Phase 3** (complete) | Economy Bridge — @sint/bridge-economy with port/adapter pattern, EconomyPlugin | +91 (737) |
| **Phase 4** (complete) | Standards Alignment — A2A bridge, rate limiting, M-of-N quorum, W3C DID identity | +78 (815) |
| **Phase 5** (complete) | Protocol Surface v0.2 — discovery/OpenAPI/schema endpoints, industrial profiles | shipped |
| **Phase 6** (complete) | Engine layer — System1/2 engines, HAL, capsule sandbox, Avatar/CSML, reference capsules | shipped |

## Deployment

### Railway (Recommended)

```bash
brew install railway
railway login
./scripts/railway-setup.sh
railway variables --set SINT_STORE=postgres SINT_CACHE=redis SINT_API_KEY=$(openssl rand -hex 32)
railway up
```

### Docker Compose

```bash
docker-compose up
# Gateway:   http://localhost:3100
# Dashboard: http://localhost:3201
# Postgres:  localhost:5432
# Redis:     localhost:6379
```

## Tech Stack

- **Runtime:** Node.js 22+
- **Language:** TypeScript 5.7 (strict mode)
- **Monorepo:** pnpm workspaces + Turborepo
- **HTTP:** Hono
- **Validation:** Zod
- **Crypto:** @noble/ed25519, @noble/hashes (audited, zero-dependency)
- **MCP SDK:** @modelcontextprotocol/sdk
- **Dashboard:** React 19, Vite 6
- **Testing:** Vitest (815 passing tests)
- **Infra:** Docker, PostgreSQL 16+, Redis 7, GitHub Actions CI, Railway

## Docs & Artifacts

- Protocol spec: [`docs/SINT_v0.2_SPEC.md`](docs/SINT_v0.2_SPEC.md)
- SIP governance: [`docs/SIPS.md`](docs/SIPS.md)
- Release notes: [`docs/RELEASE_NOTES_v0.2.md`](docs/RELEASE_NOTES_v0.2.md)
- Conformance matrix: [`docs/CONFORMANCE_CERTIFICATION_MATRIX_v0.2.md`](docs/CONFORMANCE_CERTIFICATION_MATRIX_v0.2.md)
- Deployment profiles: [`docs/profiles/`](docs/profiles/)
- Examples: [`examples/`](examples/) (hello-world, warehouse-amr, industrial-cell)
- Multi-language SDKs: [`sdks/`](sdks/) (TypeScript, Python, Go)
- Operator CLI: [`apps/sintctl/README.md`](apps/sintctl/README.md)
- Persistence baseline guide: [`docs/guides/persistence-baseline.md`](docs/guides/persistence-baseline.md)
- WebSocket approvals guide: [`docs/guides/websocket-approvals.md`](docs/guides/websocket-approvals.md)
- gRPC bridge guide: [`docs/guides/grpc-bridge-skeleton.md`](docs/guides/grpc-bridge-skeleton.md)
- Cursor integration guide: [`docs/guides/cursor-integration.md`](docs/guides/cursor-integration.md)
- Benchmark report: [`docs/reports/industrial-benchmark-report.md`](docs/reports/industrial-benchmark-report.md)
- ROS2 loop benchmark report: [`docs/reports/ros2-control-loop-benchmark.md`](docs/reports/ros2-control-loop-benchmark.md)
- Hardware safety controller roadmap: [`docs/roadmaps/hardware-safety-controller-integration.md`](docs/roadmaps/hardware-safety-controller-integration.md)
- Hardware safety handshake fixture: [`packages/conformance-tests/fixtures/industrial/hardware-safety-handshake.v1.json`](packages/conformance-tests/fixtures/industrial/hardware-safety-handshake.v1.json)
- Certification bundle summary: [`docs/reports/certification-bundle-summary.md`](docs/reports/certification-bundle-summary.md)

## Design Principles

1. **Single choke point** — Every agent action flows through `PolicyGateway.intercept()`; no bridge adapter makes authorization decisions independently
2. **Result\<T, E\> over exceptions** — All fallible operations return discriminated unions, never throw
3. **Attenuation only** — Delegated tokens can only reduce permissions, never escalate (I-T1)
4. **Append-only audit** — The evidence ledger is INSERT-only with SHA-256 hash chain integrity (I-G3)
5. **Physical safety first** — Velocity, force, and geofence constraints live *in the token*, not in external config
6. **Interface-first persistence** — Storage adapters implement clean interfaces; swap in-memory for Postgres/Redis
7. **Fail-open on infrastructure** — Economy/rate-limit infrastructure failures do not block the safety path
8. **E-stop universality** — The hardware E-stop bypasses all token checks and is unconditional (I-G2)

## References

- ROSClaw: Empirical safety analysis of LLM-controlled physical AI — [arXiv:2603.26997](https://arxiv.org/abs/2603.26997) (IROS 2026)
- MCP Security Analysis: Architectural vulnerabilities in the Model Context Protocol — [arXiv:2601.17549](https://arxiv.org/abs/2601.17549)
- IEC 62443: Industrial automation and control systems cybersecurity standard
- EU AI Act Article 13: Transparency requirements for AI systems
- NIST AI RMF: AI Risk Management Framework
- W3C DID Core: Decentralized Identifiers specification

## License

Apache-2.0
