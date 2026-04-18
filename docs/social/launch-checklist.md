# SINT Protocol Launch Checklist

Day-of sequence. Work top to bottom — each step depends on the previous.

---

## Pre-Launch (Do First)

- [ ] `git pull --rebase` — confirm on latest master
- [ ] `pnpm run build && pnpm run test` — all 1,105 tests pass
- [ ] `pnpm run demo:interceptor-quickstart` — demo transcript prints allow, escalate, and fail-closed paths
- [ ] `pnpm run docs:build` — quickstart guide resolves cleanly in docs site

---

## Step 1 — Post X Thread

Copy from `docs/social/twitter-launch-thread.md`. Post as a thread (7 tweets, each is one block).

- [ ] Attach [VIDEO] to Tweet 1 — 30s terminal demo: allow, escalate, fail-closed
- [ ] Attach [SCREENSHOT] to Tweet 4 — terminal showing `pnpm run demo:interceptor-quickstart`
- [ ] Post thread

---

## Step 2 — Post Show HN

Copy from `docs/social/show-hn-draft.md`.

- Title: `Show HN: A fail-closed policy interceptor for MCP-style agent tool calls`
- URL: `https://github.com/sint-ai/sint-protocol`
- Post the comment text as the first comment immediately after submission

- [ ] Submitted to HN
- [ ] OP comment posted

---

## Step 3 — Post LinkedIn

Copy from `docs/social/linkedin-launch-post.md`.

- [ ] Post published

---

## Step 4 — Community Distribution

From `COMMUNITY-TARGETS.md`:

- [ ] MCP Discord — #show-and-tell or #security channel
- [ ] awesome-mcp-servers or equivalent listing with the quickstart guide
- [ ] One standards-adjacent channel only after launch thread is live

---

## Step 5 — Outreach Emails

- [ ] Only send if there is inbound interest or a concrete submission reason
- [ ] Lead with the runnable demo and exact technical scope, not broad pitch language

---

## Step 6 — Monitor and Respond

- [ ] Set up GitHub notification for new issues/stars
- [ ] Respond to HN comments within 2 hours of submission
- [ ] Respond to X replies within 2 hours of posting
- [ ] Track clickthrough to the quickstart guide and demo path, not just stars

---

## Human-Only Actions (Cannot Be Automated)

- Recording the 30-second terminal demo
- Actually posting to X, HN, LinkedIn
- Responding to community replies
