# Show HN Draft — SINT Protocol

> **Title:** Show HN: SINT Protocol – Runtime authorization for physical AI agents (robots, drones, actuators)

> **URL:** https://github.com/sint-ai/sint-protocol

---

## Comment text (post as top-level comment by OP)

Hi HN,

Try this first — it'll make the rest concrete:

```bash
npx sint-scan --server myserver --tools '[
  {"name":"bash","description":"runs shell commands"},
  {"name":"readFile","description":"reads files"},
  {"name":"deleteFile","description":"deletes files"}
]'
```

It maps your MCP server's tools to SINT approval tiers and flags anything that needs human sign-off before an agent can call it. Exit code 2 on CRITICAL — drop it in CI.

---

**Why we built this:**

MCP gives AI agents powerful tools. But there's no authorization layer between "the LLM decided to call bash()" and "bash() ran." No token required. No audit trail. No rate limit. No human-in-the-loop. If the agent is compromised, you find out when the damage is done.

We built SINT Protocol because we needed a principled answer to: *what should actually happen between an agent's decision and a physical action?*

---

**What SINT does:**

Every agent action (tool call, robot command, code execution) passes through a single Policy Gateway that enforces:

1. **Capability tokens** — Ed25519-signed, attenuating credentials scoped to specific resources and actions. Delegation can only reduce permissions, never escalate.

2. **Tiered approval (T0–T3)** — authorization requirements matched to physical consequence severity:
   - T0 OBSERVE: `readFile`, `listDir` → auto-approved, logged
   - T1 PREPARE: `writeFile`, `saveConfig` → auto-approved, audited
   - T2 ACT: `deleteFile`, `moveRobot` → escalation required
   - T3 COMMIT: `bash`, `exec`, `eval` → human sign-off required

3. **Physics constraints** — hard velocity/force/geofence limits enforced at the protocol level, not in application code that can be bypassed.

4. **Tamper-evident ledger** — SHA-256 hash-chained, append-only audit log. Every decision is recorded and cryptographically detectable if tampered with.

---

**How it differs from Microsoft Agent Governance Toolkit:**
Microsoft AGT (released April 2, 2026) targets digital/software agents — LangChain, CrewAI, etc. SINT targets physical AI — robots, drones, factory actuators — where actions are irreversible and have real-world consequences. Different problem, different enforcement model.

**Technical details:**
- TypeScript monorepo, 42 packages, 1,973 tests
- Bridge adapters for MCP, ROS 2, MAVLink, MQTT, OPC-UA, gRPC, A2A, Open-RMF, Sparkplug B (12 bridges)
- Works as a proxy between any AI agent and any tool server
- All 10 OWASP Agentic AI Top-10 categories regression-tested (29 fixture pairs)
- ROS2 control-loop latency: p99 < 5ms steady-state
- Constraint Language CL-1.0: portable machine-readable safety envelopes across all bridges
- Public capability token registry (`@sint/token-registry`) for agent discovery
- Result<T, E> pattern throughout — no exceptions for control flow
- Apache 2.0 licensed

---

**What we're looking for:** Feedback on the security model, the tier classification system, and the capability token design. We're especially interested in hearing from people building with MCP servers, physical robots, or agentic pipelines where an agent going wrong would have real consequences.

Want to know if your MCP server has unsafe tools? Run:

```bash
npx sint-scan --server myserver --tools '[{"name":"bash","description":"runs shell"}]'
```

Happy to answer questions about the architecture or design decisions.
