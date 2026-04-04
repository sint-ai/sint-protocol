# SINT Protocol Launch Checklist

Day-of sequence. Work top to bottom — each step depends on the previous.

---

## Pre-Launch (Do First)

- [ ] `git pull --rebase` — confirm on latest master
- [ ] `pnpm run build && pnpm run test` — all 1,105 tests pass
- [ ] `node apps/sint-mcp-scanner/dist/cli.js --help` — CLI smoke test

---

## Step 1 — Publish @sint/mcp-scanner to npm

```bash
npm login  # log in as sint-ai org or personal account with @sint scope access
bash scripts/publish-scanner.sh --dry-run  # preview what will be published
bash scripts/publish-scanner.sh            # publish
```

Verify:
```bash
npx @sint/mcp-scanner --server test --tools '[{"name":"bash","description":"runs shell"}]'
npx sint-scan --help
```

- [ ] `npx sint-scan` works from a fresh directory (no local install)
- [ ] npm page at npmjs.com/package/@sint/mcp-scanner shows correct README and version

---

## Step 2 — Update README Badge

After npm publish, update the npm badge in README.md to the real registry link:

```
![npm](https://img.shields.io/npm/v/@sint/mcp-scanner?label=npm%3A%40sint%2Fmcp-scanner)
```

Commit: `docs(readme): add live npm badge for @sint/mcp-scanner`

---

## Step 3 — Post X Thread

Copy from `docs/social/twitter-launch-thread.md`. Post as a thread (7 tweets, each is one block).

- [ ] Attach [VIDEO] to Tweet 1 — 30s demo: dashboard + ROS2 robot arm denial
- [ ] Attach [SCREENSHOT] to Tweet 4 — terminal showing `npx sint-scan` CRITICAL output
- [ ] Tag all accounts in Tweet 7: @jspahrsummers @doppenhe @Aurimas_Gr @M_haggis @SlowMist_Team
- [ ] Post thread

---

## Step 4 — Post Show HN

Copy from `docs/social/show-hn-draft.md`.

- Title: `Show HN: SINT Protocol – MCP security layer with capability tokens, T0–T3 tiers, and tamper-evident audit log`
- URL: `https://github.com/sint-ai/sint-protocol`
- Post the comment text as the first comment immediately after submission

- [ ] Submitted to HN
- [ ] OP comment posted

---

## Step 5 — Post LinkedIn

Copy from `docs/social/linkedin-launch-post.md`.

- [ ] Post published
- [ ] Tagged: Anthropic, Open Robotics, NIST

---

## Step 6 — Community Distribution

From `COMMUNITY-TARGETS.md`:

- [ ] MCP Discord — #show-and-tell or #security channel
- [ ] LangChain Discord — #announcements or #tools
- [ ] Hugging Face Discord — #agents
- [ ] Reply to @doppenhe MCP security posts
- [ ] Reply to @Aurimas_Gr robotics security posts
- [ ] Reply to @M_haggis physical AI posts
- [ ] DM @SlowMist_Team for security research collaboration

---

## Step 7 — Outreach Emails

- [ ] ros-security@openrobotics.org — attach WHITEPAPER.md summary, link to GitHub
- [ ] ai-inquiries@nist.gov — NIST AI RMF alignment section from WHITEPAPER.md (Section 8.1)

---

## Step 8 — Monitor and Respond

- [ ] Set up GitHub notification for new issues/stars
- [ ] Respond to HN comments within 2 hours of submission
- [ ] Respond to X replies within 2 hours of posting
- [ ] Track star count: target 50 stars day 1, 200 by end of week

---

## Human-Only Actions (Cannot Be Automated)

- Recording the 30-second demo video (dashboard + ROS2 denial)
- `npm login` authentication
- Actually posting to X, HN, LinkedIn
- Sending emails to ros-security@ and ai-inquiries@
- Responding to community replies
