# The Missing Safety Layer Between AI Intent and Real-World Action

**Proposed publication:** The Agent Times

**Proposed section:** Infrastructure / Agent Security

**Dek:** SINT Protocol puts scoped authority, physical limits, human approval,
and tamper-evident evidence between an AI agent's decision and its execution.

AI agents are rapidly moving from answering questions to taking actions. They
call tools, write to systems, coordinate workflows, and increasingly interact
with robots, drones, industrial equipment, homes, and financial services. That
shift creates a new security question: what stands between an agent deciding to
act and the world actually changing?

SINT Protocol is an open-source answer to that question. It is a runtime
security and governance layer for consequential agent actions. Rather than ask
developers to trust a model to stay inside a prompt-defined boundary, SINT puts
an explicit enforcement point in the execution path.

Every governed request is sent through `PolicyGateway.intercept()`. The gateway
validates authority, applies policy and physical constraints, checks revocation
and rate limits, decides whether a human must approve the action, and records
the result in a tamper-evident evidence ledger. The downstream tool, robot, or
industrial system only sees actions that survive that process.

## The Killer Features

### 1. Capability tokens that carry real limits

SINT uses Ed25519-signed capability tokens to answer who may perform which
action on which resource, for how long, and under what constraints. Tokens can
carry limits such as velocity, force, geofence, rate, and budget.

This matters because the safety boundary travels with the authority. A robot's
maximum velocity is not merely a convention in a prompt or a setting in an
unrelated configuration file; it can be part of the signed permission that
authorizes movement. Delegation is attenuation-only, so a child token may
narrow its parent's authority but cannot expand it.

### 2. One choke point before execution

SINT's central architectural rule is deliberately simple: every authorization
decision flows through the policy gateway. Protocol bridges translate MCP,
ROS 2, MAVLink, OPC UA, MQTT, and other ecosystem-specific requests into a
common request format, but they do not make independent authorization choices.

That separation reduces policy drift. Teams get a consistent enforcement model
across digital tools and physical systems instead of rebuilding security logic
inside every adapter.

### 3. Risk-tiered human oversight

Not every action deserves the same friction. SINT classifies actions into four
approval tiers:

| Tier | Meaning | Typical handling |
|---|---|---|
| T0 | Observe | Automatically allowed and logged |
| T1 | Prepare | Automatically allowed and audited |
| T2 | Act | Escalated for human review |
| T3 | Commit | Human approval plus multi-party quorum |

Reading a status endpoint should not require the same ceremony as moving a
robot or making an irreversible commitment. The tier model lets routine work
continue while preserving human authority at consequential boundaries.

### 4. Physical-world constraints as protocol primitives

Most agent-security systems focus on software resources. SINT treats velocity,
force, geofences, nearby humans, and emergency stops as first-class enforcement
concerns. Its unconditional e-stop rule transitions any non-terminal action
state to rollback without waiting for token validation.

That physical focus is one of SINT's clearest differentiators. It is designed
for the moment when a tool call becomes motion, energy, access, or an
irreversible external effect.

### 5. Evidence, not just logs

Every policy decision can be appended to a SHA-256 hash-chained Evidence
Ledger. Because each entry is linked to the preceding entry, later tampering is
detectable. SINT can also produce proof receipts that connect authorization to
execution outcomes.

Ordinary logs help teams debug. Cryptographically linked evidence helps them
reconstruct incidents, demonstrate control operation, and support audits. SINT
treats this evidence path as part of the protocol rather than an observability
afterthought.

### 6. Revocation and forbidden-sequence controls

Authority can be revoked in real time. The gateway also evaluates recent
actions so it can reject dangerous combinations that may look harmless in
isolation. Per-token rate limiting and circuit-breaker behavior add further
runtime containment.

This is important for agentic systems because risk often emerges across a
sequence of individually plausible steps. The enforcement layer needs memory
of the action context, not only validation of a single API call.

### 7. Protocol bridges instead of a closed runtime

SINT is not a replacement for MCP, ROS 2, MAVLink, OPC UA, or agent frameworks.
It is an enforcement layer designed to sit in front of them. The repository
includes bridge packages and reference flows for tool use, robotics, drones,
industrial automation, smart-home systems, and regulated-data scenarios.

This approach lets teams keep the execution technology they already use while
adding a common authority and evidence plane.

## Why SINT Is Different

The shortest answer is that SINT governs effects, not model outputs.

Prompt guardrails, classifiers, and model policies are valuable, but they act
upstream of execution and can be bypassed by integration mistakes or unexpected
agent behavior. Identity systems can establish who an agent is without defining
the physical envelope within which it may act. Observability platforms can
explain what happened after execution without stopping an unsafe action first.

SINT combines four controls at the execution boundary:

- cryptographically scoped authority;
- pre-action policy enforcement;
- human escalation proportional to consequence; and
- hash-chained evidence of the decision.

Its unifying abstraction is a governed action. Whether that action is an MCP
tool call, a ROS 2 velocity command, an OPC UA write, or a high-value
commitment, the same questions apply: Is it authorized? Is it within limits?
Does it require review? Can we prove the decision later?

## What a Request Looks Like

A SINT request identifies the agent, capability token, resource, action, and
parameters. It may also carry physical context and recent actions. The gateway
returns a typed decision: allow, deny, escalate, or transform.

That contract makes enforcement explicit for developers. A denial is not a
generic runtime exception, and an escalation is not a silent timeout. Each is a
structured result that the surrounding system can handle deliberately.

## Built for Inspection and Contribution

SINT Protocol is published as an Apache-2.0 TypeScript monorepo. Its security
invariants are documented in the repository, and its conformance suite is meant
to turn those invariants into regression tests. Contributors can start with a
five-minute interceptor demo, run package-level tests while developing, and use
one full verification command before opening a pull request.

The project is most relevant to teams building agents that cross from
recommendation into execution: MCP operators, robotics companies, industrial
automation teams, drone and fleet developers, regulated-data platforms, and
anyone designing agents with meaningful authority.

## The Larger Bet

As agents gain autonomy, the industry will need a boundary stronger than “the
model was instructed not to.” Consequential systems need least-privilege
authority, enforceable operating envelopes, revocation, human control, and
verifiable records.

SINT Protocol's bet is that these should be interoperable runtime primitives,
not custom safeguards rebuilt inside every agent application. The model may
propose an action. SINT decides whether that action is allowed to become real.

**Project:** [github.com/sint-ai/sint-protocol](https://github.com/sint-ai/sint-protocol)

**Documentation:** [docs.sint.gg](https://docs.sint.gg)

**License:** Apache-2.0

## Editor Notes (not for publication)

- Suggested headline alternatives:
  - “Why AI Agents Need an Authorization Layer for the Physical World”
  - “SINT Protocol: Turning Agent Actions Into Governed Actions”
  - “The Runtime Control Plane for AI Agents That Can Change the World”
- Suggested pull quote: “The model may propose an action. SINT decides whether
  that action is allowed to become real.”
- Before submission, verify current package, bridge, test, and release counts;
  this draft intentionally avoids fast-aging numeric claims.
