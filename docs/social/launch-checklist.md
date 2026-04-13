# SINT Protocol Launch Checklist

Day-of sequence for launching the current public protocol story.

---

## Pre-Launch

- [ ] `git pull --rebase` on the launch branch
- [ ] `pnpm run build && pnpm run test`
- [ ] `pnpm run docs:build`
- [ ] sanity-check the current surfaces:
  - [ ] `README.md`
  - [ ] `docs/index.md`
  - [ ] `docs/getting-started.md`
  - [ ] `docs/social/show-hn-draft.md`
  - [ ] `docs/social/twitter-launch-thread.md`
  - [ ] `docs/social/linkedin-launch-post.md`

## Step 1 — Confirm the public links

- [ ] GitHub repo: `https://github.com/sint-ai/sint-protocol`
- [ ] Docs homepage: `https://docs.sint.gg`
- [ ] Quick start: `https://docs.sint.gg/getting-started`
- [ ] Protocol spec: `https://docs.sint.gg/SINT_v0.2_SPEC`
- [ ] Discussions: `https://github.com/sint-ai/sint-protocol/discussions`

## Step 2 — Publish the X thread

- [ ] Attach a short demo clip to Tweet 1
- [ ] Attach a terminal screenshot to the `sint-scan` tweet
- [ ] Post the thread from `docs/social/twitter-launch-thread.md`

## Step 3 — Post Show HN

- [ ] Use the title and body from `docs/social/show-hn-draft.md`
- [ ] Post the top-level comment immediately after submission
- [ ] Stay available to answer questions for the first two hours

## Step 4 — Publish the LinkedIn post

- [ ] Post the copy from `docs/social/linkedin-launch-post.md`
- [ ] Include the GitHub repo and docs links

## Step 5 — Community distribution

- [ ] MCP community
- [ ] robotics / ROS community
- [ ] relevant agent framework communities
- [ ] security and standards communities
- [ ] broad OSS channels from `COMMUNITY-TARGETS.md`

## Step 6 — Follow-through

- [ ] Watch discussions and issues for inbound feedback
- [ ] Respond quickly to technical questions
- [ ] Turn repeated questions into docs improvements
- [ ] Convert useful feedback into issues or RFCs
