# X/Twitter Launch Thread — SINT Protocol

> **Instructions:** Post as a thread. Each numbered section = one tweet. Add [VIDEO] asset to Tweet 1 and a terminal screenshot to Tweet 4.

---

**1/**
We built an open protocol for governing AI agent execution when actions have real-world consequences.

Capability tokens. Approval tiers. Policy gateway. Tamper-evident evidence ledger.

SINT sits between agents and the systems they can affect.

[VIDEO]

https://github.com/sint-ai/sint-protocol

---

**2/**
The problem is not "how do agents call tools?"

We already have answers for tool use and communication.

The real gap is:
- who is allowed to act
- under which constraints
- when a human must approve
- how to prove what happened later

---

**3/**
SINT handles that gap with 4 primitives:

1. capability tokens
2. runtime policy enforcement
3. T0–T3 approval tiers
4. a hash-chained evidence ledger

It works across MCP, robotics, and industrial-style execution surfaces.

---

**4/**
Fastest demo: run `sint-scan` on your MCP server and see which tools probably need stronger governance.

```bash
npx sint-scan --server myserver \
  --tools '[{"name":"bash","description":"runs shell"}]'
```

[SCREENSHOT]

---

**5/**
Why this matters:

An MCP tool call, a ROS 2 command, and a write into an industrial system should not all be treated like harmless text generation.

SINT maps consequence severity to control:

T0 observe
T1 prepare
T2 act
T3 commit

---

**6/**
SINT is not trying to replace MCP, A2A, or robotics middleware.

It sits beside them and governs execution.

Keep your framework.
Add a control plane for authorization, approval, and evidence.

Docs: https://docs.sint.gg

---

**7/**
If you build MCP servers, robots, agent runtimes, or safety-critical workflows, I’d love your feedback.

Repo: https://github.com/sint-ai/sint-protocol
Discussions: https://github.com/sint-ai/sint-protocol/discussions

#MCP #AgentSecurity #PhysicalAI #AIGovernance #OpenSource
