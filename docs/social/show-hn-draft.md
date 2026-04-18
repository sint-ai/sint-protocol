# Show HN Draft — Interceptor Demo

> **Title:** Show HN: A fail-closed policy interceptor for MCP-style agent tool calls

> **URL:** https://github.com/sint-ai/sint-protocol

---

## Comment text (post as top-level comment by OP)

Hi HN,

The fastest way to see what this does is:

```bash
pnpm install
pnpm run build
pnpm run demo:interceptor-quickstart
```

That prints one full terminal transcript:
- an MCP-style request enters the interceptor
- SINT returns `allow` or `escalate`
- the allowed path gets an audit receipt
- execution fail-closes when a verified prerequisite is missing

---

**Why we built it:**

MCP gives agents useful tools, but there is still a missing layer between “the model chose a tool” and “the real side effect happened.”

This project is a reference answer to a narrow question: what should sit in that gap when the operation is destructive, irreversible, or missing the evidence required to continue safely?

---

**What the demo shows:**

1. **Tiered decisions** — lower-risk operations can proceed; higher-risk ones escalate before execution.
2. **Fail-closed behavior** — if a required prerequisite is missing, the helper denies the action before downstream work runs.
3. **Tamper-evident receipts** — the allowed path gets a proof receipt tied to the ledger chain so the audit story is explicit.

The full repo is broader than the demo, but the demo is the most concrete path into the interception model.

---

**Implementation shape:**
- TypeScript monorepo
- reference `sint-pdp-interceptor` package
- deterministic canonical hashing for signed decision and receipt paths
- bilateral proof receipts in the ledger layer
- fail-closed guarded execution helper for downstream calls

---

**What I’d love feedback on:** whether this is the right shape for a reference interceptor:
- is `allow / escalate / deny` the right decision surface?
- is “fail closed on missing prerequisite” the right default?
- what would you want added before using this pattern in front of real tools?

Happy to answer questions about the design tradeoffs.
