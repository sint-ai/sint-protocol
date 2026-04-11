# SINT Protocol — 500-Word Pitch

**Six teams. Six codebases. Six languages. Same cryptographic primitive. Zero coordination.**

In the past 90 days, six independent AI agent projects — built in different cities, under different licenses, by teams who had never spoken — all arrived at the same design decision: Ed25519 public keys, encoded as `did:key:z6Mk...`, using the identical two-byte `[0xed, 0x01]` multicodec prefix, via the same base58btc encoding algorithm. We ran 9 cross-verification tests against motebit/motebit, one of the six. 9/9 passed. Zero code changes on either side.

This is not a coincidence. It is a theorem.

---

## The Problem

AI agents are being deployed into the physical world — robots, payment systems, medical devices, industrial controllers. The question everyone is avoiding: **who decides what the agent is allowed to do, and how do you prove it happened?**

Current answer: nobody. Agents act, log to files (if at all), and hope nothing goes wrong. When it does, there's no cryptographic trail, no bounded authority, no accountability. This is the security architecture of duct tape.

---

## The Stack

SINT Protocol is a security enforcement layer that sits between an AI agent and anything it can affect. Every action flows through a single choke point: `PolicyGateway.intercept()`. No action executes without:

1. **A capability token** — Ed25519-signed, specifying which agent, which resource, which actions, and which constraints. Delegation only attenuates: a child token can never exceed parent permissions.
2. **A tier assignment** — T0 (read-only, auto-approve) through T3 (irreversible, human sign-off). A robot moving at speed is T2. Transferring funds is T3. No configuration needed: the gateway assigns tiers based on resource type and physical context.
3. **A hash-chained evidence event** — every decision, allow or deny, appended to an append-only ledger. SHA-256 chained. No updates, no deletes. Tamper-evident by construction.

The constraint language (`CL-1.0`) binds physical limits — velocity, force, geofence — cryptographically to the token itself. A robot that receives a token capped at 0.5 m/s cannot be commanded faster, regardless of what the AI model says.

---

## The Signal

Six projects converged on the same identity primitive from first principles. That convergence is the specification. Not a committee document — executable tests that pass or fail. We have submitted crosswalk files to the OWASP AI Security Initiative and Agent Governance Vocabulary. We have cross-verification suites running against APS, motebit, MolTrust, WTRMRK, and AgentNexus. Pull requests are open. Tests are green.

The agent governance problem has exactly one hard requirement before everything else works: you need unforgeable identities that travel across systems without requiring a central authority. Ed25519 + `did:key` is that primitive. Six independent projects already know this.

---

## The Bet

Physical AI without a security enforcement layer is not a product. It is a liability waiting to be triggered. SINT Protocol is the enforcement layer — open-source, auditable, test-driven — with a cryptographic primitive that six projects have already independently chosen. 

The convergence happened without us. We're just the first to make it executable.
