# SINT Protocol — 500-Word Pitch

AI agents have crossed the line from answering questions to taking actions. They call MCP tools, operate robots, write to industrial systems, and trigger business workflows with real costs.

The problem is that most teams still treat execution governance as scattered application logic. Authorization is bolted on per tool. Human review is handled ad hoc. Audit trails are incomplete or easy to bypass. When an agent makes a risky move, there is no standard control plane between "the model decided" and "the action happened."

SINT Protocol exists to fill that gap.

SINT is an open protocol and reference stack for governing AI agent execution when actions have real-world consequences. It sits between agent frameworks and execution surfaces and provides four things developers actually need:

1. **Capability tokens** that scope who can do what, where, for how long, and under which constraints.
2. **A policy gateway** that evaluates every protected action at runtime and decides allow, deny, or escalate.
3. **Approval tiers** that map consequence severity to autonomy or human review.
4. **A tamper-evident evidence ledger** that records what happened afterward in a form suitable for audit and forensics.

This matters because existing standards mostly solve communication, not execution governance. MCP helps agents call tools. A2A helps agents talk to each other. Robotics middleware helps systems move data and commands. None of those layers, by themselves, answer the critical questions:

- Is this agent authorized to perform this action?
- Are physical or operational constraints being enforced?
- Does this action require a human to approve it?
- Can we prove the decision path after the fact?

SINT turns those questions into protocol primitives instead of one-off middleware.

For developers, the appeal is straightforward. You can keep the frameworks and transports you already use, then add a common governance model across them. A protected MCP tool call, a ROS 2 command, and an industrial bridge action can all pass through the same policy gateway. The result is a cleaner system boundary, less duplicated policy code, and a stronger story for security, compliance, and incident review.

For teams deploying physical or safety-critical AI, the value is even clearer. SINT supports token-native constraints like velocity, force, and geofence bounds, plus approval tiers that can force human review as risk rises. That makes it useful in environments where actions are not easily reversible and "just trust the model" is not an acceptable operating model.

SINT is open-source under Apache-2.0 and ships with public docs, runnable examples, a protocol spec, and a growing reference implementation around the gateway, bridges, SDKs, dashboard, and conformance tooling.

If you are building MCP infrastructure, robotics systems, agent platforms, or any workflow where an AI action can have costly consequences, SINT is the layer to evaluate. The goal is simple: make governed agent execution a protocol concern, not a recurring integration problem.

Start with the repo, run the quick start, and tell us where the model-to-action boundary still feels unsafe.
