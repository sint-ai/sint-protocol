# SINT Protocol — Announcement Drafts

> **For Seth** — pick and adapt for each platform. These are starting points, not final copy.

---

## X/Twitter Thread

**Tweet 1 (hook):**
AI agents can now control robots, execute code, and move money. But there's no security layer between "the LLM decided to do it" and "it happened in the real world."

We built one. Introducing SINT Protocol.

**Tweet 2 (what):**
SINT is an open protocol that sits between AI agents and the physical world. Every tool call, robot command, and API invocation flows through a single Policy Gateway.

4 approval tiers. Ed25519 capability tokens. Hash-chained audit logs. Physical safety constraints.

**Tweet 3 (why it matters):**
Think of it like a firewall, but for AI actions in the real world.

- T0: Read sensor? Auto-approved, logged.
- T1: Write a file? Auto-approved, audited.
- T2: Move a robot? Requires review.
- T3: Execute code? Requires a human.

**Tweet 4 (technical):**
Built as a multi-MCP proxy — works with Claude, Cursor, or any MCP client today. Also supports ROS 2 for robotics.

12 packages. 370 tests. TypeScript. Apache-2.0.

Full protocol spec: github.com/sint-ai/sint-protocol/blob/main/PROTOCOL.md

**Tweet 5 (CTA):**
We're looking for contributors:
- New bridge adapters (gRPC, MQTT, CAN bus)
- Python and Go SDKs
- Domain-specific tier rules

Star the repo, open an issue, or just tell us where we're wrong.

github.com/sint-ai/sint-protocol

---

## Hacker News

**Title:** SINT Protocol: An open security layer between AI agents and the physical world

**Text:**
AI agents can now control robots, execute code, move money, and operate machinery. But there's no standard security layer between "the LLM decided to do X" and "X happened."

SINT is that layer. It's an open protocol (Apache-2.0) that routes every agent action — MCP tool calls, ROS 2 commands, API invocations — through a single Policy Gateway.

Key ideas:

- **Graduated approval tiers (T0–T3):** Read sensor data? Logged automatically. Move a robot arm? Requires review. Execute arbitrary code? Requires a human in the loop. The tier system maps consequence severity to authorization requirements.

- **Ed25519 capability tokens** with attenuation-only delegation — agents can delegate permissions to sub-agents, but only narrower ones. Max 3 hops.

- **Forbidden combination detection** — `filesystem.write` → `exec.run` is individually fine but together is code injection. SINT catches these sequences.

- **Hash-chained evidence ledger** — every decision is recorded in a SHA-256 hash-chained append-only log. Tamper-evident by construction.

- **Physical safety constraints** — velocity, force, and geofence limits enforced at the protocol level, not in application code.

Currently works as a multi-MCP proxy (sits between Claude/Cursor and downstream MCP servers) and has a ROS 2 bridge. 12 packages, 370 tests, all TypeScript.

We're looking for early contributors, especially for gRPC bridges, Python/Go SDKs, and domain-specific tier rules.

Repo: https://github.com/sint-ai/sint-protocol
Protocol spec: https://github.com/sint-ai/sint-protocol/blob/main/PROTOCOL.md

---

## Reddit (r/artificial, r/MachineLearning, r/robotics)

**Title:** We built an open security protocol for AI agents acting in the physical world (SINT Protocol)

**Body:**
The problem: AI agents can now control robots, execute code, move money. There's no standard security layer between "the model decided" and "it happened in the real world."

SINT Protocol is our attempt at solving this. It's a single Policy Gateway that every agent action flows through — whether that's an MCP tool call, a ROS 2 robot command, or an API request.

**How it works:**

Every request gets assigned an approval tier based on consequence severity:
- T0 (Observe): Read sensors → auto-approved, logged
- T1 (Prepare): Write file → auto-approved, audited
- T2 (Act): Move robot → requires review
- T3 (Commit): Execute code, transfer money → requires human

Agents authenticate with Ed25519 capability tokens that scope what they can do (which resources, which actions, physical constraints like max velocity or geofence). Tokens can be delegated to sub-agents, but only with narrower permissions (attenuation-only).

The protocol also detects forbidden action sequences — individually safe actions that are dangerous in combination (e.g., write file then execute it = code injection path).

Everything is recorded in a SHA-256 hash-chained audit log.

**Current state:** 12 TypeScript packages, 370 tests, works as a multi-MCP proxy (Claude, Cursor) + ROS 2 bridge. Apache-2.0 licensed.

**Looking for contributors:** New bridge adapters (gRPC, MQTT), Python/Go SDKs, domain-specific tier rules, and anyone who wants to poke holes in the threat model.

GitHub: https://github.com/sint-ai/sint-protocol
