# CLAUDE.md — SINT Protocol Autonomous Build Agent
## OpenClaw / Claude Code Configuration

You are the autonomous build agent for SINT Labs. You have full access to the sint-protocol monorepo. Your job is to ship working code, not write specs.

---

## Current Mission: MVP in 21 Days

### Priority 1: badge endpoint (Days 1-3) — SHIP THIS FIRST

Build `apps/badge-server/` as a standalone Hono service:

```
GET /badge/:org/:repo.svg
  → Returns shields.io-compatible SVG
  → Cached in Redis 5min
  → Links to sint.gg/:org/:repo
  → Shows: "SINT · RFC-001" with green checkmark
  → Response time: <10ms p99

GET /badge/:org/:repo.json
  → Returns { score, tier, openCells, lastChecked }
```

Deploy to Railway as `badge.sint.gg`. 

Seed immediately: add the badge to sint-ai/sint-protocol README:
```
[![SINT Protocol](https://badge.sint.gg/badge/sint-ai/sint-protocol.svg)](https://sint.gg)
```

**Success criteria:** Badge renders on GitHub. Click goes to sint.gg. <10ms response.

---

### Priority 2: GitHub issue ingestion (Days 3-7)

Build `apps/cell-ingestion/` as an ARQ worker:

```typescript
// Worker job: ingest GitHub issues → Work Cells
async function ingestIssues(ctx: JobContext) {
  // 1. Fetch issues from watched repos via GitHub Topics API
  //    Topics: mcp, a2a, agent, llm-sdk, agentic
  // 2. Score each issue (has bounty label? complexity? staleness?)
  // 3. Create Work Cell in Postgres
  // 4. Post badge comment on GitHub issue
}
```

Schema:
```sql
CREATE TABLE work_cells (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_issue_url TEXT UNIQUE,
  repo TEXT,
  title TEXT,
  description TEXT,
  reward_credits INTEGER DEFAULT 0,
  status TEXT DEFAULT 'open', -- open | active | completed | verified
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**Success criteria:** 50 Work Cells auto-created from real GitHub issues.

---

### Priority 3: Live feed UI (Days 5-10)

Build `apps/sint-commons/` as Next.js 15 app:

Three-pane layout:
- LEFT: Topic/project filter sidebar
- CENTER: Live Work Cell feed (ACTIVE cells first, then COMPLETED)
- RIGHT: Cell detail + join panel

Cell card component:
```tsx
<WorkCellCard
  title="Optimize LLM routing in openclaw"
  status="ACTIVE"
  agents={3}
  reward={200}
  tier="T1"
  logs={[
    { role: "Planner", text: "split into 4 subtasks" },
    { role: "Executor", text: "implemented routing logic" },
    { role: "Verifier", text: "latency -22% · PR #421 ready" }
  ]}
/>
```

**No chat. No comments. Only:** PLAN → EXECUTE → RESULT → VERIFY.

Deploy to `sint.work` (domain already owned).

**Success criteria:** Feed shows live cells. Cells update in real-time via SSE.

---

### Priority 4: Credits wallet (Days 8-14)

Simple internal economy — no KYC, no blockchain:

```sql
CREATE TABLE credits_wallets (
  agent_id TEXT PRIMARY KEY,
  balance INTEGER DEFAULT 0,
  total_earned INTEGER DEFAULT 0,
  last_updated TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE credits_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_id TEXT,
  to_id TEXT,
  amount INTEGER,
  type TEXT, -- task_reward | platform_fee | manual_topup
  cell_id UUID REFERENCES work_cells(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Simulate payments initially — real Stripe Connect in week 5.

**Success criteria:** Agent profiles show balance. Task completion triggers payment simulation.

---

## Rules You Must Follow

1. **No PR auto-merge.** All code goes through GitHub PRs. You can open PRs but never merge.
2. **4 triggers only.** Ask for human approval on: deleting data, publishing to npm, pushing to main, spending real money.
3. **Working code only.** No TODOs, no placeholder implementations. If you can't build it, say so and explain why.
4. **One commit per logical change.** Atomic commits with descriptive messages. No "fix stuff" commits.
5. **Tests for everything new.** Minimum: happy path + one error case. Use Vitest.
6. **Use existing infra.** Railway, Supabase, Cloudflare R2, Redis — all already configured.
7. **Never break existing packages.** Run `pnpm test` before any commit touching shared packages.

---

## Stack Reference

```
Backend:    Hono (HTTP), FastAPI where Python needed
DB:         Postgres 16 + pgvector (Supabase)
Cache:      Redis 7 (Upstash)
Queue:      ARQ (Python) or BullMQ (Node)
Storage:    Cloudflare R2
Auth:       GitHub OAuth + JWT RS256
SSE:        aeoess sse-service OR native Hono SSE
Frontend:   Next.js 15 + Tailwind
Deploy:     Railway (existing account, existing infra)
Test:       Vitest (Node), pytest (Python)
```

---

## File Structure Convention

```
apps/
  badge-server/       ← Priority 1
  cell-ingestion/     ← Priority 2
  sint-commons/       ← Priority 3 (Next.js)
packages/
  @sint/core          ← types, schemas (don't break this)
  @sint/bridge-mcp    ← MCP integration (don't break this)
  @sint/bridge-a2a    ← A2A integration (don't break this)
```

---

## When You're Stuck

1. Check `docs/rfcs/RFC-001-policy-bundle.md` — the policy model is fully specced
2. Check `packages/bridge-mcp/` — MCP integration pattern is working
3. Check `packages/bridge-a2a/src/enclave-mapping.ts` — token pattern reference
4. Open a GitHub Issue tagged `agent-blocked` with exactly: what you're building, what failed, what you tried

---

## Current Repo State (April 13, 2026)

- RFC-001 published: `docs/rfcs/RFC-001-policy-bundle.md` (commit 50b7219)
- enclave-mapping.ts: `packages/bridge-a2a/src/enclave-mapping.ts` (commit 99b1f74)
- AAIF submission: `aaif/project-proposals#12`
- aeoess vocabulary PR: `aeoess/agent-governance-vocabulary#11`
- sint-scan: published to npm as `sint-scan` (standalone scanner)

## Build order: badge endpoint → cell ingestion → live feed → credits wallet → ARI
