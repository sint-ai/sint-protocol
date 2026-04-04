# SINT Branch + PR Integration Playbook (2026-04-04)

This runbook captures the current multi-agent merge state and the safest execution order to converge work without rewriting history.

## Current State

1. `main` is the GitHub default branch.
2. A large 2026 execution stream is on `master`.
3. Open PRs are split across:
   - `base: master` for current execution work
   - `base: main` for older community/docs tracks
4. CI is currently configured for both `main` and `master` while branch convergence is in progress.

## Canonical Integration PR

- PR #42: `master -> main`
- Purpose: converge execution stream into default branch without force-push/rebase rewriting.
- Status: currently conflicting, requires manual conflict resolution.

## Recommended Merge Order

1. Land PR #42 (`master -> main`) first.
2. Rebase open `base: master` PRs onto `main` and retarget.
3. Close duplicate consolidation PRs whose commits are already included by #42.
4. Land feature PRs with unique scope:
   - #32 `feat/mcp-scanner-cli`
   - #33 `feat/oatr-domain-verification`
   - #34 `feat/conformance-dashboard-ui`
   - #41 `codex/roadmap-q2-q4-2026`
5. Re-run benchmark and certification workflows on `main`.

## Duplicate PR Detection Rule

Before reviewing a PR, verify whether its head commit is already reachable from `main`:

```bash
git fetch --all --prune
git merge-base --is-ancestor <head_sha> origin/main && echo "already-in-main"
```

If already reachable, close the PR as superseded and reference the integrating PR.

## Parallel-Agent Safety Rules

1. Never force-push shared integration branches.
2. Keep feature branches single-scope.
3. Avoid cross-branch cherry-picks unless linked in PR notes.
4. Require CI green plus conformance fixtures on every branch before merge.
5. Add explicit "write scope" in PR description when multiple agents are active.

## Operational Commands

```bash
gh pr list --state open --limit 100
gh pr view <number> --json baseRefName,headRefName,mergeable,statusCheckRollup,url
git log --oneline origin/main..origin/master
git log --oneline origin/master..origin/main
```
