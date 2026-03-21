# Show HN Draft — SINT Protocol

> **Title:** Show HN: SINT Protocol – Open-source security layer for physical AI (capability tokens + tiered approval)

> **URL:** https://github.com/sint-ai/sint-protocol

---

## Comment text (post as top-level comment by OP)

Hi HN,

We built SINT Protocol because AI agents are increasingly controlling physical systems — robots, industrial equipment, financial infrastructure — and there's no standard security layer between the model's decision and the physical action.

**What SINT does:** Every agent action (tool call, robot command, API request) passes through a single Policy Gateway that enforces:

1. **Capability tokens** — Ed25519-signed, attenuating credentials scoped to specific resources and actions. Delegation can only reduce permissions, never escalate.

2. **Tiered approval** — Four levels (T0–T3) matching authorization requirements to physical consequence severity. Read-only is auto-approved. Moving a robot arm requires escalation. Executing code requires a human.

3. **Physical constraints** — Hard limits on velocity, force, temperature, geofence boundaries enforced at the protocol level.

4. **Evidence ledger** — SHA-256 hash-chained, append-only audit log. Every decision is recorded and tamper-detectable.

**Technical details:**
- TypeScript monorepo, 12 packages, 370+ tests
- Bridge adapters for MCP (Model Context Protocol) and ROS 2
- Works as a proxy between any AI agent and any tool server
- Result<T, E> pattern throughout — no exceptions for control flow
- Apache 2.0 licensed

**What we're looking for:** Feedback on the security model, the tier classification system, and the capability token design. We're especially interested in hearing from people building with MCP servers or robotic systems.

We built this because we needed it for our own AI agents and couldn't find anything like it. Happy to answer questions about the architecture or design decisions.
