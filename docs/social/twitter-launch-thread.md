# X/Twitter Launch Thread — Interceptor Demo

> **Instructions:** Post as a thread. Each numbered section = one tweet. Add [VIDEO] asset to Tweet 1 showing the interceptor quickstart transcript or terminal flow.

---

**1/**
We built a fail-closed policy interceptor for MCP-style tool calls.

It gives one concrete path:
request -> decision -> receipt

And when a prerequisite is missing, downstream execution does not run.

[VIDEO: quick terminal demo — allow, escalate, fail-closed]

github.com/sint-ai/sint-protocol

---

**2/**
The gap it tries to close:

an agent decides to call a tool, and the real side effect happens immediately.

That’s fine for some workloads, but not for destructive or irreversible ones.

---

**3/**
The demo shows three outcomes:

1. `allow`
2. `escalate`
3. `deny` before execution when a required prerequisite is missing

That last one was the behavior we cared about most.

---

**4/**
Fastest way to try it:

[SCREENSHOT: terminal showing quickstart transcript]

```bash
pnpm install
pnpm run build
pnpm run demo:interceptor-quickstart
```

The quickstart guide is in the repo and walks through the exact flow.

---

**5/**
Two implementation details that mattered:

Deterministic canonical hashing for signed decision and receipt paths.

Proof receipts so the allowed path has explicit audit evidence rather than “trust us, it was logged.”

---

**6/**
The broader repo goes further than the demo:

- interceptor package
- ledger layer
- capability tokens
- MCP / ROS2 / MAVLink / industrial bridges

But the quickstart is the shortest path to understanding the core model.

---

**7/**
If you’re building agent tooling and care about what should happen between “tool selected” and “side effect happened,” I’d love feedback.

Especially on:
- fail-closed defaults
- escalation ergonomics
- what a reference interceptor should expose

github.com/sint-ai/sint-protocol

#MCP #AgentSecurity #AIAgents #OpenSource
