# SINT Protocol

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
- **ROSClaw (IROS 2026):** Up to 4.8× spread in out-of-policy LLM action proposals across frontier models under identical safety envelopes. The 3.4× divergence between frontier backends is measurable, reproducible, and persistent — an adversary who can influence model selection can systematically increase the burden on physical safety layers.
- **MCP security (arXiv:2601.17549):** 10 documented real-world MCP breaches in under 8 months, including a CVSS 9.6 command injection affecting 437,000 downloads. MCP's security weaknesses are architectural, not implementation-specific.
- **SROS2:** Formally demonstrated to contain 4 critical vulnerabilities at ACM CCS 2022, including access-control bypasses permitting arbitrary command injection across robot networks.
- **Unitree BLE worm (September 2025):** Hardcoded crypto keys enabled wormable BLE/Wi-Fi command injection across robot fleets — precisely the scenario SINT's per-agent token scoping and real-time revocation prevent.

**Core guarantees:**
- No agent action ever bypasses the Policy Gateway (invariant I-G1: No Bypass)
- Every decision is recorded in a tamper-evident SHA-256 hash-chained ledger (invariant I-G3: Ledger Primacy)
- Physical constraints (velocity, force, geofence) are enforced at the protocol level — in the token, not in config
- E-stop is universal across all non-terminal DFA states (invariant I-G2: E-stop Universality)
- Graduated approval tiers match authorization to physical consequence severity
- Per-agent capability tokens with real-time revocation (ConsentPass endpoint)
- W3C DID identity (`did:key:z6Mk...` Ed25519 keys)
- Google A2A Protocol bridge for multi-agent physical AI coordination
- Per-token rate limiting via sliding window counter
- M-of-N multi-party approval quorum for irreversible physical actions

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

The **ACTING** state is only reachable via POLICY_EVAL with a valid token. Physical actuation is structurally impossible without a valid capability token — it cannot be circumvented even by a compromised model backend.

### Tier Assignment Function

```
Tier(r) = max(BaseTier(r), Δ_human(r), Δ_trust(r), Δ_env(r), Δ_novelty(r))
```

where each Δ ∈ {0, +1}: human presence detected, trust score below threshold, near physical boundary, or action outside validated distribution.

### Formal Invariants

| Invariant | Description |
|-----------|-------------|
| **I-T1** (Attenuation) | `scope(child_token) ⊆ scope(parent_token)` — delegation can only reduce permissions |
| **I-T2** (Unforgeability) | Capability tokens are Ed25519-signed; valid tokens are computationally unforgeable |
| **I-T3** (Physical Constraint Primacy) | Physical constraints (velocity, force, geofence) in a token cannot be weakened by any downstream layer |
| **I-G1** (No Bypass) | Physical actuation is only reachable from the ACTING DFA state, which is only reachable via POLICY_EVAL |
| **I-G2** (E-stop Universality) | The `estop` event transitions any non-terminal state to ROLLEDBACK unconditionally |
| **I-G3** (Ledger Primacy) | COMMITTING → COMPLETED requires `ledger_committed`; no action completes without a ledger record |

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

## Packages

| Package | Description | Tests |
|---------|-------------|-------|
| [`@sint/core`](packages/core) | Types, Zod schemas, tier constants, formal DFA states | — |
| [`@sint/gate-capability-tokens`](packages/capability-tokens) | Ed25519 tokens, delegation, W3C DID identity | 39 |
| [`@sint/gate-policy-gateway`](packages/policy-gateway) | Authorization engine: tiers, constraints, rate limiting, M-of-N quorum | 57 |
| [`@sint/gate-evidence-ledger`](packages/evidence-ledger) | SHA-256 hash-chained append-only audit log with TEE attestation | 29 |
| [`@sint/bridge-mcp`](packages/bridge-mcp) | MCP tool call interception and risk classification | 43 |
| [`@sint/bridge-ros2`](packages/bridge-ros2) | ROS 2 topic/service/action interception with physics extraction | 20 |
| [`@sint/bridge-a2a`](packages/bridge-a2a) | Google A2A Protocol bridge for multi-agent coordination | 24 |
| [`@sint/bridge-mqtt-sparkplug`](packages/bridge-mqtt-sparkplug) | MQTT Sparkplug profile mapping with industrial command tiering defaults | 8 |
| [`@sint/bridge-opcua`](packages/bridge-opcua) | OPC UA node/method mapping with safety-critical write/call promotion | 6 |
| [`@sint/bridge-open-rmf`](packages/bridge-open-rmf) | Open-RMF fleet/facility mapping for warehouse dispatch workflows | 5 |
| [`@sint/bridge-economy`](packages/bridge-economy) | Economy bridge: balance, budget, trust, billing ports | 55 |
| [`@sint/persistence`](packages/persistence) | Storage interfaces + in-memory/PG/Redis implementations | 26 |
| [`@sint/client`](packages/client) | TypeScript SDK for the Gateway API (delegation, SSE) | 12 |
| [`@sint/conformance-tests`](packages/conformance-tests) | Security regression suite — all phases | 77 |
| [`@sint/gateway-server`](apps/gateway-server) | Hono HTTP API with approvals, SSE streaming, A2A routes | 57 |
| [`@sint/mcp`](apps/sint-mcp) | Security-first multi-MCP proxy server | 90 |
| [`@sint/dashboard`](apps/dashboard) | Real-time approval dashboard with operator auth | 29 |
| **Total** | **17 packages** | **Workspace-wide conformance suite** |

## Quick Start

```bash
# Prerequisites: Node.js >= 22, pnpm >= 9
pnpm install
pnpm run build
pnpm run test        # full workspace regression suite
```

### Start the Gateway Server

```bash
pnpm --filter @sint/gateway-server dev
# → http://localhost:3100/v1/health
```

### Standardization and Deployment Artifacts

- v0.2 protocol surface spec: [`docs/SINT_v0.2_SPEC.md`](docs/SINT_v0.2_SPEC.md)
- SIP governance track: [`docs/SIPS.md`](docs/SIPS.md)
- Release notes: [`docs/RELEASE_NOTES_v0.2.md`](docs/RELEASE_NOTES_v0.2.md)
- Conformance/certification matrix: [`docs/CONFORMANCE_CERTIFICATION_MATRIX_v0.2.md`](docs/CONFORMANCE_CERTIFICATION_MATRIX_v0.2.md)
- Deployment profile templates:
  - [`docs/profiles/warehouse-amr.policy.template.json`](docs/profiles/warehouse-amr.policy.template.json)
  - [`docs/profiles/industrial-cell.policy.template.json`](docs/profiles/industrial-cell.policy.template.json)
  - [`docs/profiles/edge-gateway.policy.template.json`](docs/profiles/edge-gateway.policy.template.json)
- Runnable demos:
  - [`examples/hello-world/README.md`](examples/hello-world/README.md)
  - [`examples/warehouse-amr/README.md`](examples/warehouse-amr/README.md)
  - [`examples/industrial-cell/README.md`](examples/industrial-cell/README.md)
- Multi-language SDK starters:
  - [`sdks/python/sint_client.py`](sdks/python/sint_client.py)
  - [`sdks/go/sintclient/client.go`](sdks/go/sintclient/client.go)
- Benchmark report automation:
  - Script: [`scripts/generate-industrial-benchmark-report.mjs`](scripts/generate-industrial-benchmark-report.mjs)
  - CI workflow: [`.github/workflows/industrial-benchmark-report.yml`](.github/workflows/industrial-benchmark-report.yml)
  - Generated artifacts: [`docs/reports/industrial-benchmark-report.md`](docs/reports/industrial-benchmark-report.md)

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

## Key Concepts

### Capability Tokens

Ed25519-signed capability tokens — the *only* authorization primitive. Unlike RBAC (ambient authority to principals), OCap requires explicit token presentation for every operation. This is what prevented the Unitree BLE worm from propagating: a compromised robot cannot reuse another robot's token.

Token fields:
- **Resource scoping** — what the agent can access (`ros2:///cmd_vel`, `mcp://filesystem/*`, `a2a://agents.example.com/*`)
- **Action restriction** — what operations are allowed (`publish`, `call`, `subscribe`, `a2a.send`)
- **Physical constraints** — max velocity (m/s), max force (N), geofence polygon, time window, rate limit
- **Delegation chains** — max 3 hops, attenuation only (invariant I-T1)
- **Revocation** — instant invalidation via revocation store (ConsentPass endpoint)
- **W3C DID identity** — `did:key:z6Mk...` format for agent portability across systems

### Evidence Ledger

Every policy decision is recorded in a SHA-256 hash-chained append-only log. Chain integrity: `ℓ_k.previousHash = SHA256(canonical(ℓ_{k-1}))` for all k. A gap (missing sequence number) or hash mismatch constitutes tamper evidence.

**Retention policy** (per formal specification):
| Tier | Retention |
|------|-----------|
| T0 (OBSERVE) | 30 days |
| T1 (PREPARE) | 90 days |
| T2 (ACT) | 180 days |
| T3 (COMMIT) | 365 days (indefinite if legal hold) |

**Event taxonomy:**
- **Agent lifecycle:** `agent.registered`, `agent.capability.granted`, `agent.capability.revoked`
- **Request/response:** `request.received`, `policy.evaluated`, `approval.requested/granted/denied/timeout`
- **Execution:** `action.started`, `action.completed`, `action.failed`, `action.rolledback`
- **Physical safety (unique to SINT):** `safety.estop.triggered`, `safety.geofence.violation`, `safety.force.exceeded`, `safety.human.detected`, `safety.anomaly.detected`
- **Economic:** `economy.balance.*`, `economy.budget.*`, `economy.trust.*`, `sla.bond.slashed`

### CSML: Composite Safety-Model Latency

A deployment metric that fuses behavioral and physical safety dimensions into one auditable score:

```
CSML(m, p, t) = α·AR_m + β·BP_m + γ·SV_m - δ·CR_m + ε·𝟙[ledger_intact(t)]
```

Where: AR_m = adversarial attempt rate, BP_m = mean blocked calls per prompt (from ROSClaw), SV_m = median overspeed severity, CR_m = task completion rate, with default coefficients α=0.4, β=0.2, γ=0.2, δ=0.1, ε=0.1.

CSML above a deployment threshold θ automatically escalates all subsequent requests from that model backend to the next tier — making Evidence Ledger behavioral data feed back into authorization policy.

### Google A2A Protocol Bridge

The `@sint/bridge-a2a` package implements the Google Agent-to-Agent (A2A) protocol as a SINT bridge, enabling secure multi-agent physical AI coordination:

- `A2AInterceptor` wraps PolicyGateway for JSON-RPC 2.0 A2A task calls
- `AgentCardRegistry` manages A2A Agent Card registration
- `/v1/a2a` endpoint in gateway-server for JSON-RPC 2.0 protocol
- A2A actions map to SINT tiers: navigate/move→T2_act, report/status→T0_observe, configure→T3_commit

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

### EU AI Act Article 13 Alignment

| Requirement | SINT Approach |
|-------------|---------------|
| Logging and traceability | SHA-256 hash-chained Evidence Ledger — tamper detection is cryptographic |
| Human oversight | Dynamic Consent + T3 approval gate — T3 actions cannot execute without recorded human approval |
| Risk management | Tier escalation based on real-time physical context (Δ_human, Δ_env, Δ_novelty) |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/.well-known/sint.json` | Public protocol discovery (version, bridges, profiles, schemas) |
| `GET` | `/v1/health` | Health check |
| `GET` | `/v1/schemas` | List machine-readable public schemas |
| `GET` | `/v1/schemas/:name` | Fetch schema by name |
| `GET` | `/v1/openapi.json` | OpenAPI surface for gateway integration |
| `POST` | `/v1/intercept` | Evaluate a single request |
| `POST` | `/v1/intercept/batch` | Evaluate multiple requests (207 Multi-Status) |
| `POST` | `/v1/tokens` | Issue a capability token |
| `POST` | `/v1/tokens/delegate` | Delegate (attenuate) a token |
| `POST` | `/v1/tokens/revoke` | Revoke a token |
| `GET` | `/v1/ledger` | Query audit ledger events |
| `GET` | `/v1/approvals/pending` | List pending approval requests |
| `POST` | `/v1/approvals/:id/resolve` | Approve or deny a request (M-of-N quorum) |
| `GET` | `/v1/approvals/events` | SSE stream for real-time approval events |
| `POST` | `/v1/a2a` | JSON-RPC 2.0 A2A protocol endpoint |
| `GET/POST` | `/v1/a2a/agents` | Agent Card registration |
| `GET` | `/v1/metrics` | Prometheus metrics |

## Development Phases

| Phase | Description | Tests |
|-------|-------------|-------|
| **Phase 1** (complete) | Security Wedge — capability tokens, PolicyGateway, EvidenceLedger | 425 |
| **Phase 2** (complete) | Engine Core — bridge-mcp, bridge-ros2, engine packages, persistence, gateway-server | +221 (646) |
| **Phase 3** (complete) | Economy Bridge — @sint/bridge-economy with port/adapter pattern, EconomyPlugin | +91 (737) |
| **Phase 4** (complete) | Standards Alignment — A2A bridge, rate limiting, M-of-N quorum, W3C DID identity | +78 (815) |
| **Phase 5** (complete) | Protocol Surface v0.2 — discovery/OpenAPI/schema endpoints, industrial profiles, token execution metadata | shipped |

## Tech Stack

- **Runtime:** Node.js 22+
- **Language:** TypeScript 5.7 (strict mode)
- **Monorepo:** pnpm workspaces + Turborepo
- **HTTP:** Hono
- **Validation:** Zod
- **Crypto:** @noble/ed25519, @noble/hashes (audited, zero-dependency)
- **MCP SDK:** @modelcontextprotocol/sdk
- **Dashboard:** React 19, Vite 6, CSS custom properties
- **Testing:** Vitest (815+ tests)
- **Infra:** Docker, PostgreSQL 16+, Redis 7, GitHub Actions CI, Railway

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
- IEC 62443: Industrial automation and control systems cybersecurity standard (December 2025 update)
- EU AI Act Article 13: Transparency requirements for AI systems
- NIST AI RMF: AI Risk Management Framework (GOVERN / MAP / MEASURE / MANAGE)
- W3C DID Core: Decentralized Identifiers specification

## License

Apache-2.0
