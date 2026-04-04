# SINT Protocol — Value Proposition

## The Problem

AI agents are moving from chat into production. Organizations now run dozens of autonomous agents across engineering, research, operations, and support. But deploying agents at scale exposes a fundamental gap:

**There is no standard way to orchestrate, govern, and audit AI agents as a workforce.**

Every team builds ad-hoc solutions. Agents conflict on shared tasks. There is no audit trail. No budget control. No coordination protocol. No security enforcement layer between "the LLM decided to do it" and "it happened."

## What Exists Today

| Layer | Protocol | What It Solves | What It Doesn't |
|-------|----------|---------------|-----------------|
| Tool access | **MCP** (Anthropic) | How agents call tools | How agents coordinate with each other |
| Agent messaging | **A2A** (Google) | How two agents communicate | Multi-agent orchestration, governance, audit |
| Frameworks | AutoGen, CrewAI, LangGraph | Multi-agent within one framework | Cross-framework interop, wire-level protocol |

**The orchestration layer is missing.** No protocol defines how to manage agent lifecycles, coordinate multi-agent workflows, enforce budgets, or audit every action — across any framework, language, or runtime.

## SINT Protocol: The Orchestration Layer

SINT sits above MCP and A2A. It composes with them, not against them. SINT defines the protocol-level primitives for running AI agents in production.

### Six Pillars

**1. Heartbeat Lifecycle** — Agents operate on observable heartbeat cycles: wake, check for work, execute a step, report status, sleep. Stall detection is built in. Agent liveness becomes a first-class system metric.

**2. Task Coordination** — Tasks are checked out with exclusive locks. One agent, one task, no conflicts. Dependencies, priorities, deadlines, and parent-child hierarchies are protocol-native.

**3. Chain of Command** — Every agent operates within an organizational hierarchy. Approvals escalate based on risk. Budgets are enforced per-agent and per-task.

**4. Graduated Governance (T0-T3)** — Authorization mapped to consequence severity. Reading data? Auto-approved. Moving a robot? Requires review. Executing code? Requires a human. The tier system scales from fully autonomous to fully supervised.

**5. Cryptographic Audit** — Every action is recorded in a SHA-256 hash-chained evidence ledger. Tamper-evident by construction. Queryable by agent, task, time range. Designed for enterprise compliance without blockchain overhead.

**6. Capability Tokens** — Ed25519-signed permissions with resource scoping, action restrictions, physical safety constraints, and attenuation-only delegation. Agents can delegate to sub-agents but only with narrower permissions.

## Why It Matters

| Stakeholder | Value |
|-------------|-------|
| **CTO / VP Eng** | Operational control over agent fleets. Budget governance. Compliance-ready audit trails. |
| **AI/ML Engineers** | Cross-framework interop. Clean protocol design. Build agents in any language. |
| **Security / Compliance** | Hash-chained audit. Graduated approval tiers. Forbidden combination detection. |
| **Product Managers** | Task lifecycle visibility. Cost tracking. Multi-agent workflow coordination. |

## Current State

- **12 packages, 370+ tests, Apache-2.0**
- Reference implementation in TypeScript (Node.js 22+)
- MCP proxy bridge (works with Claude, Cursor, any MCP client)
- ROS 2 bridge for robotics
- Gateway HTTP API with Prometheus metrics
- Real-time approval dashboard
- Docker Compose production deployment

## What's Next

- Heartbeat agent lifecycle and task queue (Q2 2026)
- PostgreSQL/Redis persistence adapters
- Python and Go SDKs
- Testnet for community integration testing
- Protocol spec v1.0-rc

## Get Involved

- **GitHub:** github.com/sint-ai/sint-protocol
- **Contribute:** Bridge adapters, SDKs, tier rules, conformance tests
- **Discuss:** GitHub Discussions for RFCs and community Q&A
- **License:** Apache-2.0

---

*SINT Protocol is the trust, orchestration, and governance layer for AI agent execution — once autonomous systems move beyond simple chat into real action.*
