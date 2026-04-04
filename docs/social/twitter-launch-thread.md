# X/Twitter Launch Thread — SINT Protocol

> **Instructions:** Post as a thread from @sint_ai. Each numbered section is one tweet.

---

**1/**
We just open-sourced SINT Protocol — a security enforcement layer for physical AI.

AI agents can now control robots, move money, and execute code. But there's no standard security layer between "the model decided" and "the action happened."

SINT is that layer.

github.com/sint-ai/sint-protocol

**2/**
How it works:

Every agent action passes through a single Policy Gateway.

The gateway checks:
- Capability tokens (Ed25519-signed, scoped credentials)
- Approval tier (T0 observe → T3 irreversible)
- Physical constraints (velocity, force, geofence)
- Forbidden action combos

No action bypasses the gate.

**3/**
The approval tier system matches authorization to physical consequence:

T0 OBSERVE — auto-approve (read sensors)
T1 PREPARE — auto-approve (save config)
T2 ACT — requires escalation (move robot)
T3 COMMIT — human required (exec code, transfer funds)

**4/**
Every decision is recorded in a SHA-256 hash-chained evidence ledger.

Append-only. No updates. No deletes.

Any tampering is cryptographically detectable.

This is your audit trail when the regulator asks "what did your AI do and why?"

**5/**
What's shipping today:

- 12 packages, 370+ tests
- MCP bridge (works with Claude, Cursor, any MCP client)
- ROS 2 bridge (robots, drones, industrial equipment)
- Ed25519 capability tokens with delegation
- Real-time approval dashboard
- TypeScript SDK

**6/**
We built SINT because we needed it ourselves.

We run AI agents that operate in the physical world. The security primitives available were either too coarse (ACLs) or too brittle (prompt constraints).

So we built the enforcement layer we wished existed and open-sourced it.

**7/**
Want to contribute?

- 3 good-first-issue tickets open now
- Whitepaper, tokenomics, and roadmap in docs/
- GitHub Discussions enabled

Apache 2.0 licensed. Build with us.

github.com/sint-ai/sint-protocol
