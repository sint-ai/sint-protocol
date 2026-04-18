# Show HN Draft — Interceptor Demo

> **Title:** Show HN: A fail-closed policy interceptor for MCP agent tool calls (with receipts)

> **URL:** https://github.com/sint-ai/sint-protocol

---

## Comment text (post as top-level comment by OP)

Hi HN,

If you only try one thing, run the **5-minute interceptor demo** (Node 22 + pnpm):

```bash
pnpm install --frozen-lockfile
pnpm run build
pnpm run demo:interceptor-quickstart
```

It prints one terminal transcript with three paths:
1. **Allow**: tool call proceeds and produces a tamper-evident proof receipt.
2. **Escalate**: irreversible tool call is blocked pending approval (and does not execute).
3. **Fail-closed**: a physical/actuator-like call is denied when a required prerequisite is missing (no “best effort” fallback).

---

**Why we built it:**

MCP gives agents useful tools, but there’s still a missing layer between “the model chose a tool” and “the real side effect happened.”

This is a reference answer to a narrow question: what should sit in that gap when the operation is destructive/irreversible, or missing evidence required to continue safely?

---

**What the demo shows:**

1. **Tiered decisions** — lower-risk operations can proceed; higher-risk ones escalate before execution.
2. **Fail-closed behavior** — if a required prerequisite is missing, execution is denied before any downstream work runs.
3. **Tamper-evident receipts** — allowed paths get a signed receipt tied to a hash chain (portable verification via canonical JSON).

The full repo is broader than the demo, but the demo is the most concrete path into the interception model.

---

**Implementation shape:**
- TypeScript monorepo
- reference `sint-pdp-interceptor` package
- deterministic canonical hashing for signed decision + receipt paths
- proof receipts in the ledger layer (and room for bilateral receipts)
- guarded execution helper for downstream calls

---

**What I’d love feedback on:** whether this is the right shape for a reference interceptor:
- is `allow / escalate / deny` the right decision surface?
- is “fail closed on missing prerequisite” the right default?
- what would you want added before using this pattern in front of real tools?

Happy to answer questions about the tradeoffs, or to share a minimal “wrap an existing MCP server” example if that’s more interesting than the toy demo.
