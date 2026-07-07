# OSS Maintainer Program Eligibility Plan

Goal: qualify for open-source maintainer programs that use the following criteria. This document records where `sint-ai/sint-protocol` stands today, which criteria are realistically reachable, and the work plan to get there.

Audit date: 2026-07-07.

## The Five Criteria

| # | Criterion | Threshold | Status today | Verdict |
|---|-----------|-----------|--------------|---------|
| 1 | Maintainers / library authors | 500+ dependent repos, 100+ dependent packages, or 200k+ combined monthly downloads | ~14 packages on npm (`@pshkv/*`, `sint-mcp`) at 0.1.0, negligible downloads, ~0 known dependents | Long game (12+ months) |
| 2 | Core contributors | Committer on CPython, Kubernetes, Apache PMC, etc. | Not applicable to this repo | Out of scope |
| 3 | Active contributors | 100+ merged PRs in repos you don't own, last 12 months | Personal track, not repo-dependent | Most controllable — ~2 PRs/week |
| 4 | Community builders | 20+ unique external contributors with merged PRs in last 12 months on one repo | **6 unique external authors** with merged PRs since repo creation (2026-03-17) | **Primary target — reachable in 6–9 months** |
| 5 | Critical infrastructure | OpenSSF criticality score ≥ 0.4 | Not yet measured; repo is ~4 months old with one dominant committer — estimated well below 0.4 | Secondary target (6–12 months) |

Baseline detail for criterion 4 (merged PRs by non-owner authors as of audit date): clawdiy (10), ExpertVagabond (6), peterxing (1), ppcvote (1), faisal-hendra (1), AuthorPrime (1) — 21 PRs, 6 unique authors. Gap: **14 more unique external contributors** within a rolling 12-month window.

Repo health snapshot: 11 stars, 6 forks, 36 open issues, discussions enabled, Apache-2.0, topics set, issue/discussion templates in place, CI + docs-site + npm-publish workflows exist.

## Quick Fixes Found During the Audit

These are adoption blockers that cost nothing to fix and gate everything below.

1. **`npx sint-scan` is a broken call to action.** `COMMUNITY-TARGETS.md` leads the MCP audience with `npx sint-scan`, but `sint-scan` is not published to npm. Worse, two in-repo packages both claim the name (`apps/sint-scan-standalone` and `apps/sint-mcp-scanner-standalone`). *Status: consolidated to a single `apps/sint-scan-standalone` (kept the richer implementation). Remaining: `npm publish` from that directory.*
2. **README examples don't install.** README and CLAUDE.md reference `@sint/*` package names (`@sint/gateway-server`, `@sint/bridge-mcp`, `@sint/bridge-homeassistant`), but the published scope is `@pshkv/*`. Anyone copy-pasting an import or `pnpm --filter` command hits a wall. *Status: README, CLAUDE.md, tutorials, the secure-MCP guide, and the root `bench`/`sintctl` scripts now use the real `@pshkv/*` names. Remaining: decide whether to migrate the registry scope (e.g. `@sint-protocol`) long-term; specs/whitepaper prose still says `@sint/*`.*
3. **The tag-triggered publish workflow has never run.** There are no git tags, so `npm-publish.yml` (which publishes with SLSA provenance) has never fired — the 0.1.0 packages were published manually without provenance. Cut a `v0.2.0` tag + GitHub Release. Releases are also a direct input to the OpenSSF criticality score. *Status: open — needs a maintainer to tag.*
4. **Nothing measures these five criteria.** *Status: done — `pnpm run community:eligibility-metrics` appends a snapshot row to `docs/community/eligibility-metrics.md` (auto-fills npm downloads; manual columns documented there). The OpenSSF Scorecard workflow now runs weekly on `main`.*

## Track A — Community Builders (primary)

Target: 20 unique external contributors with merged PRs inside a rolling 12-month window. Current pace suggests this needs deliberate funnel work, not just launch spikes.

1. **Keep a live pool of 25–30 curated starter issues.** The generator exists (`pnpm run community:starter-board`); the discipline is keeping each issue small, labeled `good first issue`/`help wanted`, with acceptance criteria and pointers to the exact files. The bridge packages are ideal — each is independent, so parallel first-time contributions don't conflict.
2. **Execute the launch moments already drafted.** Show HN, the Twitter/LinkedIn threads, and the MCP/robotics community posts in `docs/social/` and `COMMUNITY-TARGETS.md` are written but unshipped. Each launch should end with a link to the starter board, not just the README.
3. **Hacktoberfest 2026 (October).** Add the `hacktoberfest` topic, pre-stage 30 issues, and commit to a <48h review SLA for the month. This alone commonly brings 10+ unique external contributors to a well-prepared repo.
4. **Make contribution visible.** Merge fast, credit contributors in release notes, add an all-contributors section to the README. The `first_contribution.yml` issue template already exists — route newcomers through it.
5. **Sustain the SLA.** Respond to every external PR/issue within 48 hours. Slow response is the top funnel killer; a stale first PR loses the contributor and everyone who reads the thread.

Pace needed: ~2 new unique external contributors per month baseline, with launch and Hacktoberfest spikes covering the rest → 20 by roughly 2027-Q1.

## Track B — OpenSSF Criticality Score ≥ 0.4 (secondary)

The criticality score is a weighted mix of: repo age, recency of updates, contributor count, contributor-org count, commit frequency, recent releases, closed/updated issue counts, comment frequency, and dependents mentions. Age and single-maintainer concentration are the current drags; both improve with time plus Track A.

Actions that move specific signals:

- **Monthly tagged releases** (`recent_releases`) — the publish workflow makes this nearly free once quick fix #3 lands.
- **Issue hygiene** (`closed_issues_count`, `updated_issues_count`, `comment_frequency`) — triage the 36 open issues weekly; close or update stale ones.
- **Contributor and org diversity** (`contributor_count`, `org_count`) — direct output of Track A.
- **Dependents mentions** (`dependents_count`) — grows as other repos reference sint packages in commits; direct output of Track C.
- **Measure monthly.** Run the `criticality_score` CLI against the repo each month and log the number in the scorecard. Do not guess — the gap tracker (`docs/community/openssf-gap-tracker.md`) should carry the real score.
- **Adjacent credibility work** — add the OpenSSF Scorecard GitHub Action and pursue the Best Practices badge. Neither feeds the criticality score directly, but both are already Sprint D commitments and strengthen any program application.

## Track C — Downloads and Dependents (compounding)

200k monthly downloads is not reachable by publishing alone; it requires surfaces that generate *recurring automated* downloads. Priorities in order of downloads-per-effort:

1. **`sint-scan` as a zero-config `npx` tool** (after quick fix #1). Every scan is a download; it is also the repo's best top-of-funnel asset per `COMMUNITY-TARGETS.md`.
2. **A GitHub Action** (`sint-ai/sint-action`) that runs the MCP scan / conformance check in CI. Every dependent repo's CI run produces recurring downloads, and every adopting repo counts toward the 500-dependent-repos threshold.
3. **MCP registry listings** for `sint-mcp` — the official MCP registry, Smithery, mcp.so, Glama (`glama.json` already exists). MCP proxy installs are the most natural recurring-use surface.
4. **Publish the remaining integration surfaces**: `@pshkv/integration-langchain`, the Python SDK to PyPI, the Rust SDK to crates.io. The criterion counts *combined* downloads across registries.
5. **Starter templates** (`create-sint-app`, example repos) — each derived project is a dependent repo.

## Track D — Personal Contribution Path (criterion 3)

100 merged PRs in repos you don't own over 12 months is ~2 per week, and it is the only criterion fully under one person's control. Aim contributions where they also serve SINT: MCP spec and reference servers, OWASP ASI documents, LangChain/LangGraph, ROS 2 docs, Home Assistant, MAVLink. Every upstream integration PR is simultaneously marketing for the protocol. Log merged PRs in the scorecard monthly.

## Measurement

Extend the weekly scorecard (`scripts/update-maintainer-scorecard.mjs` → `docs/community/independent-maintainer-scorecard.md`) with five columns, one per criterion:

| Metric | Source |
|---|---|
| Combined monthly downloads (npm + PyPI + crates.io) | `api.npmjs.org/downloads`, `pypistats.org`, `crates.io` API |
| Dependent repos / packages | GitHub dependency graph, `deps.dev` |
| Unique external contributors, rolling 12 months | GitHub search: `repo:sint-ai/sint-protocol is:pr is:merged -author:<owner>` |
| OpenSSF criticality score | `criticality_score` CLI, monthly |
| Upstream merged PRs, rolling 12 months | GitHub search: `author:<owner> is:pr is:merged -org:sint-ai` |

## Sequenced Milestones

**Weeks 1–2 (quick fixes):** resolve the `sint-scan` name collision and publish it; pick the permanent npm scope and align README/CLAUDE.md; tag `v0.2.0` and let the provenance publish workflow run; add eligibility columns to the scorecard.

**Days 30:** starter-issue pool at 25+; Show HN and community posts shipped; MCP registry listings live; first criticality-score measurement logged.

**Days 60:** GitHub Action published with 3+ example adopter repos; LangChain integration and Python SDK published; ≥9 unique external contributors (rolling 12 months).

**Days 90:** Hacktoberfest prep complete (issues staged, topic added); ≥12 unique external contributors; criticality score re-measured with trend.

**Days 180:** ≥20 unique external contributors (criterion 4 met); criticality score ≥0.3 and climbing; downloads trend established across three registries; 50+ upstream merged PRs on the personal track.

## Decision Rule

When choosing between tasks, prefer the one that creates an *external* signal — a contributor's merged PR, a download from someone else's CI, a dependent repo — over internal breadth. The criteria measure what others do with the project, not what the project contains.
