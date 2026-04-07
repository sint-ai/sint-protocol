# Discord Launch Kit

Copy/paste assets for launching and running the SINT Discord community.

## Launch Announcement Template

```text
SINT Discord is live.

Purpose:
- Integration help (MCP, A2A, ROS2, IoT)
- Runtime safety/policy discussion
- Contributor onboarding and good-first issues

Start here:
- #welcome
- #rules
- #good-first-issues
- #ros2-and-robotics

If you're building in robotics/industrial AI, share your use case and we’ll help scope a fixture or adapter together.
```

## Welcome Message Template (`#welcome`)

```text
Welcome to SINT.

We’re building an open governance + safety control plane for physical AI that complements existing agent/tool protocols.

New here?
1) Share what you’re building in #introductions
2) Pick a starter task from #good-first-issues
3) Ask for pairing help in #contributor-onboarding
```

## Rules Message Template (`#rules`)

```text
Be respectful. Be technical. Be reproducible.

- No harassment, doxxing, or malware sharing
- Keep security-sensitive details in private reporting channels
- For bug/safety claims, include repro context when possible
- Focus on solving problems together across ecosystems
```

## Good-First-Issues Seeding Workflow

1. Refresh the board:

```bash
pnpm run community:starter-board
```

2. Post top 5 links from `docs/community/good-first-issues-board.md` into `#good-first-issues`.
3. Keep one maintainer on response duty for 24h after launch.

## Suggested First Week Cadence

1. Day 1: Launch announcement + office hours time.
2. Day 2: Pairing thread for first-time contributors.
3. Day 3: Publish one solved support thread recap.
4. Day 5: Share one merged external PR or active first PR.

## Related Assets

- Runbook: `docs/community/discord-launch-runbook.md`
- Onboarding guide: `docs/community/external-contributor-onboarding.md`
- Collaboration replies: `docs/community/open-source-collaboration-replies.md`
- Starter board: `docs/community/good-first-issues-board.md`
