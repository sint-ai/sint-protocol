# OWASP Agentic AI Security Solutions Landscape Submission

Status: submission-ready packet for issue `#125`

## Source Check

- Landscape page: `https://genai.owasp.org/ai-security-solutions-landscape/`
- Q2 2026 Agentic AI resource: `https://genai.owasp.org/resource/ai-security-solutions-landscape-for-agentic-ai-q2-2026/`
- Submission path: the landscape page exposes `Submit - Agentic AI Solution`.
- OWASP description: the landscape is a community resource, not an endorsement, and contributions are reviewed for accuracy.

## Suggested Form Answers

Solution name:

```text
SINT Protocol
```

Website / repository:

```text
https://github.com/sint-ai/sint-protocol
```

Open source or commercial:

```text
Open source
```

Short description:

```text
SINT Protocol is an open-source runtime security and governance layer for agentic and physical AI. It places a PolicyGateway before tool calls, ROS2 actions, MCP tools, A2A tasks, IoT/industrial bridges, and payment-like actions, enforcing capability tokens, approval tiers, physical constraints, revocation, and tamper-evident evidence receipts.
```

Lifecycle stages:

```text
Deploy, Operate, Monitor, Govern, Test & Evaluate
```

Agentic security coverage:

```text
SINT maps to OWASP Agentic Security Initiative ASI01-ASI10 with machine-readable fixtures and conformance tests. Core controls include pre-action authorization, scoped capability tokens, Ed25519 subject binding, model fingerprint checks, unsafe-code escalation, memory integrity checks, circuit breakers, T2/T3 human approval, revocation, and evidence-ledger receipts.
```

Differentiator:

```text
SINT adds physical-AI and industrial safety enforcement that most agent security tools do not cover: velocity/force/geofence constraints in tokens, ROS2/SROS2 and industrial bridge fixtures, e-stop rollback semantics, hardware safety handshakes, and receipt-backed policy decisions for real-world actions.
```

Evidence links:

```text
OWASP ASI mapping:
https://github.com/sint-ai/sint-protocol/blob/main/docs/conformance/owasp-asi-mapping.md

Machine-readable ASI fixture pack:
https://github.com/sint-ai/sint-protocol/blob/main/packages/conformance-tests/fixtures/security/owasp-asi-conformance.v1.json

Physical AI runtime safety fixtures:
https://github.com/sint-ai/sint-protocol/tree/main/packages/conformance-tests/fixtures/physical-ai

Conformance test command:
pnpm --filter @pshkv/conformance-tests test:fixtures
```

Contact:

```text
Illia Pashkov / SINT Protocol maintainers
GitHub: https://github.com/sint-ai/sint-protocol
```

## Manual Submission Checklist

- [x] Submission packet prepared
- [x] Evidence links verified in repo
- [ ] Form submitted through `Submit - Agentic AI Solution`
- [ ] OWASP response recorded in issue `#125`
- [ ] Listing accepted or feedback converted into follow-up issues

## Follow-Up Reply

```text
Thanks for reviewing SINT for the Agentic AI Security Solutions Landscape. We can provide a smaller evidence bundle if helpful: ASI01-ASI10 mapping, fixture pack, conformance command, and a short note on the physical-AI/ROS2 safety boundary.
```
