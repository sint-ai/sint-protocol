# SINT Protocol: A Layered Open Standard for Security, Governance, and Economic Enforcement in Physical AI Systems

**Version 0.1 — Draft**
**March 2026**

---

## Abstract

As AI agents gain the ability to control robots, execute code, move money, and operate physical machinery, a critical gap has emerged: there is no standard security layer between an LLM's decision and its physical-world consequence. SINT Protocol fills this gap with a layered enforcement architecture that combines capability-based authorization, graduated approval tiers mapped to consequence severity, tamper-evident audit logging, and physical constraint enforcement — all flowing through a single Policy Gateway choke point.

This paper describes the problem, the SINT architecture, its differentiation from existing agent protocols, token economics considerations, and a development roadmap.

---

## 1. Problem: The Missing Security Stack for Physical AI

### 1.1 The Convergence

Three trends are converging in 2026:

1. **LLM-powered agents** can now autonomously chain tool calls, make decisions, and operate continuously (AutoGPT, CrewAI, Claude agents, OpenAI Codex).
2. **Physical AI** is maturing — humanoid robots (Figure, Tesla Optimus, 1X), autonomous drones, industrial cobots, and smart infrastructure are increasingly LLM-directed.
3. **Agent protocols** (MCP, ACP, A2A, AgentProtocol) are standardizing how agents communicate — but none address what happens when an agent's decision has physical consequences.

### 1.2 The Gap

Current agent protocols solve agent *communication* and *interoperability*. None enforce:

- **Physical safety constraints** — velocity limits, force ceilings, geofence boundaries
- **Graduated authorization** mapped to consequence severity (reading a sensor ≠ moving a robot arm)
- **Dangerous sequence detection** — blocking `credential.read → http.request` chains
- **Tamper-evident audit** — cryptographic proof that every decision was logged
- **Delegation with attenuation** — ensuring delegated permissions can only narrow, never escalate

Without this layer, an LLM that decides to "move the robot arm to position X" has no intermediary verifying that X is within safe bounds, that the agent has permission, that no human is in the workspace, or that the action was logged for regulatory compliance.

### 1.3 Why Now

- **NIST AI Agent Standards Initiative** (Feb 2026) explicitly calls for agent identity, authorization, and security standards
- **EU AI Act** (effective 2026) classifies autonomous physical systems as high-risk, requiring documented safety enforcement
- **Insurance/liability** frameworks demand auditable decision chains for autonomous physical systems
- **21 billion+ IoT devices** and millions of industrial robots are now network-connected and AI-addressable

---

## 2. SINT Architecture

### 2.1 Design Principles

1. **Single choke point** — Every agent action flows through `PolicyGateway.intercept()`. No bypass path exists.
2. **Result<T, E> over exceptions** — All operations return discriminated unions, never throw. Predictable error handling at every layer.
3. **Attenuation only** — Delegated tokens can only reduce permissions. A child agent can never escalate beyond its parent's capabilities.
4. **Append-only audit** — The Evidence Ledger is insert-only with SHA-256 hash chains. No updates, no deletes, no gaps.
5. **Physical safety first** — Velocity, force, and geofence constraints are first-class citizens, not afterthoughts.
6. **Interface-first persistence** — Storage adapters implement clean interfaces. Swap in-memory for PostgreSQL/Redis without code changes.
7. **Per-server policy** — Each downstream tool server can have its own security ceiling and approval requirements.

### 2.2 Layer Model

```
┌─────────────────────────────────────────────┐
│  Layer 4: Bridges (MCP, ROS 2, future)      │  Protocol-specific interception
├─────────────────────────────────────────────┤
│  Layer 3: Policy Gateway                     │  Single choke point: tier, constraints, combos
├─────────────────────────────────────────────┤
│  Layer 2: Capability Tokens                  │  Ed25519-signed, scoped, delegatable
├─────────────────────────────────────────────┤
│  Layer 1: Evidence Ledger                    │  SHA-256 hash-chained audit log
├─────────────────────────────────────────────┤
│  Layer 0: Core Types & Schemas               │  Zod-validated types, tier constants
└─────────────────────────────────────────────┘
```

### 2.3 Approval Tiers

Authorization is graduated based on physical consequence severity:

| Tier | Name | Auto-approved? | Examples |
|------|------|---------------|---------|
| **T0** | OBSERVE | Yes (logged) | Read sensor data, query database, list files |
| **T1** | PREPARE | Yes (audited) | Write file, save waypoint, update configuration |
| **T2** | ACT | Requires review | Move robot, operate gripper, start motor |
| **T3** | COMMIT | Requires human | Execute arbitrary code, transfer funds, change operating mode |

Tier escalation triggers:
- Human detected near robot → T2 escalates to T3
- New/untrusted agent → tier escalates by one level
- Forbidden action sequence detected → T3 required
- Server policy `requireApproval: true` → all non-T0 calls escalate

### 2.4 Capability Tokens

Ed25519-signed tokens carrying:
- **Resource scoping** — `ros2:///cmd_vel`, `mcp://filesystem/*`
- **Action restriction** — `publish`, `call`, `subscribe`
- **Physical constraints** — `maxVelocityMps: 0.5`, `maxForceNewtons: 10`, geofence polygon
- **Delegation chain** — max 3 hops, attenuation-only
- **Time bounds** — issue and expiry timestamps
- **Revocation** — instant invalidation via revocation store

### 2.5 Evidence Ledger

Every policy decision produces a hash-chained log entry:
- SHA-256 linking to previous entry (tamper-evident)
- Cryptographic proof receipts for any individual decision
- Queryable by agent, event type, time range, tier
- Meets regulatory requirements for decision audit trails

### 2.6 Forbidden Combinations

SINT detects and blocks dangerous multi-step sequences:
- `filesystem.write` → `exec.run` (code injection)
- `credential.read` → `http.request` (credential exfiltration)
- `database.write` → `database.execute` (SQL injection escalation)

---

## 3. Competitive Landscape & Differentiation

### 3.1 Existing Protocols

| Protocol | Focus | Physical Safety | Auth/Permissions | Audit | Status |
|----------|-------|----------------|-----------------|-------|--------|
| **MCP** (Anthropic) | Tool context for LLMs | ❌ None | Basic (OAuth 2.1 planned) | ❌ None | Spec v2026, widespread adoption |
| **ACP** (IBM/Linux Foundation) | Agent-to-agent communication | ❌ None | Capability tokens (basic) | ❌ None | Open standard, BeeAI reference |
| **A2A** (Google) | Agent interoperability | ❌ None | Enterprise auth | ❌ None | Google ecosystem focus |
| **AgentProtocol** (LangChain) | Framework-agnostic agent API | ❌ None | ❌ None | ❌ None | Specification only |
| **ANP** | Agent networking | ❌ None | DID-based identity | ❌ None | Early stage |
| **SINT** | **Physical AI security** | ✅ **First-class** | ✅ **Ed25519 capability tokens** | ✅ **Hash-chained ledger** | 12 packages, 370 tests |

### 3.2 SINT's Unique Position

SINT does not compete with MCP or ACP — it **complements** them. SINT is the security enforcement layer that sits between any agent protocol and the physical world:

```
Agent ──► MCP/ACP/A2A ──► SINT Policy Gateway ──► Physical World
                                    │
                          Evidence Ledger (auditable)
```

**Key differentiators:**
1. **Physical constraint enforcement** — No other protocol enforces velocity, force, or geofence limits at the protocol level
2. **Consequence-graduated authorization** — Tiers mapped to physical severity, not just role-based access
3. **Dangerous sequence detection** — Proactive blocking of multi-step attack patterns
4. **Tamper-evident audit** — Cryptographic hash chain, not just logs
5. **MCP-native integration** — Ships as an MCP proxy, works with Claude/Cursor out of the box
6. **ROS 2 bridge** — Native integration with the dominant robotics middleware

---

## 4. Token Economics (Preliminary)

### 4.1 SINT Token Utility (Exploratory)

The SINT Protocol may incorporate a utility token for:

1. **Staking for trust** — Operators stake tokens proportional to the physical consequence tier they operate at. Higher-tier operations (T2/T3) require larger stakes.
2. **Audit verification bounties** — Token rewards for third parties who verify ledger integrity and report discrepancies.
3. **Policy marketplace** — Token-gated access to community-contributed policy rule sets (industry-specific: healthcare, manufacturing, logistics).
4. **Insurance pools** — Token-backed insurance for physical AI operations, with premiums determined by historical audit scores.

### 4.2 Economic Model

- **Deflationary mechanism** — Small token burn on each T3 (human-required) approval resolution
- **Staking tiers** — T0/T1 (no stake), T2 (minimum stake), T3 (significant stake)
- **Slashing** — Operators who bypass the gateway or tamper with ledger entries lose staked tokens

*Note: Token economics are exploratory. SINT Protocol functions fully without a token. Tokenization would be pursued only if it creates genuine utility beyond existing enforcement mechanisms.*

---

## 5. Technical Architecture Overview

### 5.1 Current Implementation

| Component | Package | Tests |
|-----------|---------|-------|
| Core types & schemas | `@sint/core` | — |
| Capability tokens | `@sint/gate-capability-tokens` | 31 |
| Policy gateway | `@sint/gate-policy-gateway` | 39 |
| Evidence ledger | `@sint/gate-evidence-ledger` | 29 |
| MCP bridge | `@sint/bridge-mcp` | 43 |
| ROS 2 bridge | `@sint/bridge-ros2` | 20 |
| Persistence layer | `@sint/persistence` | 26 |
| TypeScript SDK | `@sint/client` | 10 |
| Conformance tests | `@sint/conformance-tests` | 29 |
| Gateway server (Hono) | `@sint/gateway-server` | 44 |
| MCP proxy server | `@sint/mcp` | 80 |
| Approval dashboard | `@sint/dashboard` | 19 |
| **Total** | **12 packages** | **370 tests** |

### 5.2 Technology Stack

- TypeScript 5.7 (strict mode), Node.js 22+
- pnpm workspaces + Turborepo monorepo
- Hono HTTP framework, Zod validation
- @noble/ed25519, @noble/hashes (audited, zero-dependency crypto)
- MCP SDK integration
- React 19 + Vite 6 dashboard
- PostgreSQL 16, Redis 7, Docker Compose

---

## 6. Roadmap

### Q2 2026: Foundation & Adoption
- WebSocket approval streaming (replace SSE polling)
- PostgreSQL and Redis persistence adapters (production-grade)
- Docker Hub images with pre-configured compose stacks
- SDK for Python (bridge to robotics ecosystem)
- First integrations with robot simulation environments (Gazebo, Isaac Sim)

### Q3 2026: Ecosystem & Standards
- Submit to NIST AI Agent Standards Initiative
- Conformance test suite as standalone certification tool
- Plugin system for custom bridge adapters (beyond MCP/ROS 2)
- Multi-gateway federation (distributed enforcement across facilities)
- Community policy marketplace (industry-specific rule sets)

### Q4 2026: Production & Scale
- Hardware security module (HSM) integration for token signing
- Real-time constraint enforcement benchmarks (<1ms decision latency)
- Enterprise deployment guides (manufacturing, logistics, healthcare)
- Formal verification of core policy engine invariants
- Token economics pilot (if community interest validates utility)

---

## 7. Conclusion

SINT Protocol is the security enforcement layer that physical AI systems need but don't yet have. While existing protocols solve agent communication, SINT ensures every physical-world action is authorized, constrained, audited, and revocable. With 12 packages, 370 tests, and native MCP/ROS 2 integration already built, SINT is positioned to become the standard security stack for the emerging physical AI ecosystem.

---

## References

1. NIST AI Agent Standards Initiative (Feb 2026) — https://www.nist.gov/news-events/news/2026/02/announcing-ai-agent-standards-initiative-interoperable-and-secure
2. Model Context Protocol — https://modelcontextprotocol.io
3. Agent Communication Protocol (IBM/Linux Foundation) — https://agentcommunicationprotocol.dev
4. CoSAI MCP Security Analysis — https://github.com/cosai-oasis/ws4-secure-design-agentic-systems
5. EU AI Act High-Risk Classification — https://artificialintelligenceact.eu
6. Okta: AI Agents and Cyber-Physical IAM — https://www.okta.com/blog/ai/ai-agents-cyber-physical-iam-safety/

---

*SINT Protocol is developed by SINT AI Lab / PSHKV Inc., Los Angeles, CA.*
*License: Apache-2.0*
*Contact: i@pshkv.com | GitHub: sint-ai/sint-protocol*
