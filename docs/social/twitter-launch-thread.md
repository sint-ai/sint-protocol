# X/Twitter Launch Thread — SINT Protocol

> **Instructions:** Post as a thread. Each numbered section = one tweet. Add [VIDEO] asset to Tweet 1 (30s demo: dashboard + ROS2 robot denial). Screenshot of `npx sint-scan` output goes in Tweet 4.

---

**1/**
We built the Policy Gateway MCP has been begging for.

Capability tokens. T0–T3 approval tiers. Physics constraints. Tamper-evident ledger.

Every agent action — tool calls, robot commands, code execution — flows through a single choke point before it touches the real world.

[VIDEO: 30s demo — dashboard + ROS2 robot denial]

github.com/sint-ai/sint-protocol

---

**2/**
Here's the gap nobody talks about:

MCP gives AI agents powerful tools. But there's zero authorization between "the LLM decided to call bash()" and "bash() ran."

No token required. No audit trail. No rate limit. No human-in-the-loop.

If the agent is compromised, you find out when the damage is done.

---

**3/**
SINT maps authorization to physical consequence:

🟢 T0 OBSERVE — readFile, listDir → auto-allowed, logged
🟡 T1 PREPARE — writeFile, saveConfig → auto-allowed, audited
🟠 T2 ACT — deleteFile, moveRobot → requires escalation
🔴 T3 COMMIT — bash, exec, eval → requires human sign-off

A robot arm moving at 3 m/s needs different governance than a read query. SINT encodes that difference.

---

**4/**
`npx sint-scan` — audit any MCP server for risks in 10 seconds:

[SCREENSHOT: terminal showing CRITICAL bash + HIGH deleteFile + recommendations]

```
npx sint-scan --server myserver \
  --tools '[{"name":"bash","description":"runs shell"}]'
```

Exit code 2 on CRITICAL. Drop it in your CI pipeline.

---

**5/**
Two features nobody else has:

**Physics constraints** — velocity caps, force limits, geofence polygons enforced at the protocol level. Not in application code that can be bypassed.

**Tamper-evident ledger** — SHA-256 hash-chained, append-only. Every decision recorded. Any tampering is cryptographically detectable.

Your compliance team will thank you.

---

**6/**
Full OWASP Agentic AI Top-10 coverage. All 10 ASI categories regression-tested:

ASI01 goal hijacking → GoalHijackPlugin (5-layer heuristics)
ASI05 shell via tool calls → T3 classifier
ASI06 memory poisoning → MemoryIntegrityChecker
ASI10 rogue agent → CircuitBreakerPlugin (EU AI Act Art. 14(4)(e) stop button)

1,105 tests. 31 packages. Apache-2.0.

---

**7/**
If you're building with MCP, thinking about physical AI, or care about what happens when agents go wrong — this is for you.

Star, share, break it: github.com/sint-ai/sint-protocol

cc @jspahrsummers @doppenhe @Aurimas_Gr @M_haggis @SlowMist_Team

#MCP #AgentSecurity #PhysicalAI #AIGovernance #OWASP
