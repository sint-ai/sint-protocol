# Show HN Draft — SINT Protocol

> **Title:** Show HN: SINT Protocol – execution governance for MCP, robots, and safety-critical AI

> **URL:** https://github.com/sint-ai/sint-protocol

---

## Comment text (post as top-level comment by OP)

Hi HN,

SINT Protocol is our attempt at solving a problem we kept running into: once an AI agent can do more than generate text, what actually governs the action?

MCP gives agents powerful tool access. Robotics middleware gives them a path to physical systems. But there is still a missing layer between "the model decided to do this" and "the action happened."

SINT is an open protocol and reference stack for that missing layer.

The core idea is simple:

- **Capability tokens** define which agent can do what, where, for how long, and under which constraints
- **A policy gateway** evaluates each protected action and decides allow, deny, or escalate
- **Approval tiers** map consequence severity to autonomy or human review
- **A tamper-evident evidence ledger** records what happened afterward

That means a protected MCP tool call, a ROS 2 command, or an industrial bridge action can all pass through the same execution-governance model.

If you want the shortest path to something concrete, try the quick start or run the MCP scanner:

```bash
npx sint-scan --server myserver --tools '[
  {"name":"bash","description":"runs shell commands"},
  {"name":"readFile","description":"reads files"},
  {"name":"deleteFile","description":"deletes files"}
]'
```

It classifies MCP tools against SINT approval tiers and flags the ones that probably should not be callable without stronger controls.

What feels interesting to us is that this is not trying to replace MCP, A2A, or robotics middleware. It sits beside them and governs execution:

- who is authorized
- what constraints apply
- when a human must approve
- what evidence remains afterward

Docs are here: https://docs.sint.gg

Repo is here: https://github.com/sint-ai/sint-protocol

I’d especially love feedback from people building MCP servers, robotics systems, or agent runtimes where a bad action would have real consequences.
