# LinkedIn Launch Post — SINT Protocol

> **Instructions:** Post from personal or company account. Tone: professional, outcome-focused. Tag company pages where possible.

---

## Post Text

AI agents are moving into production — controlling robots, executing code, managing infrastructure. But most deployments have a dangerous gap: **there's no authorization layer between the model's decision and the physical action.**

Today we're open-sourcing **SINT Protocol** — the security enforcement layer for production AI agents.

SINT sits between your AI agents and every tool they can call. Every action is authorized by a signed capability token, classified into an approval tier (auto-approve → human sign-off), and recorded in a tamper-evident audit log. Shell execution and irreversible operations require explicit human approval. Physics constraints — velocity, force, geofence — are enforced at the protocol level, not in application code.

**Why it matters for enterprises:**
- **EU AI Act compliance** — Article 14(4)(e) human oversight requirement is built-in via the CircuitBreaker stop mechanism
- **NIST AI RMF alignment** — GOVERN-1.1 (human oversight), MANAGE-4.2 (incident response), MEASURE-2.6 (monitoring) are directly addressed
- **Audit-ready** — SHA-256 hash-chained evidence ledger with SIEM export. Every agent decision is cryptographically recorded
- **MCP + ROS2 + IoT ready** — bridge adapters for Model Context Protocol, ROS 2, MAVLink, MQTT, OPC-UA out of the box

1,105 tests. 31 packages. Apache-2.0. Production-ready Docker Compose deployment.

Scan your MCP server's tools right now: `npx sint-scan`

GitHub: https://github.com/sint-ai/sint-protocol
Whitepaper: https://github.com/sint-ai/sint-protocol/blob/master/WHITEPAPER.md

What gap in AI agent security keeps you up at night? Happy to discuss in the comments.

---

## Hashtags

#AIAgents #AIGovernance #MCP #PhysicalAI #CyberSecurity #Robotics #EUAIAct #NIST #OpenSource #AgentSecurity

## Tags to include (company pages)

- Anthropic
- Open Robotics
- NIST

