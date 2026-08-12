# AI Agent Onboarding

This is the shortest safe path for an AI coding agent joining SINT Protocol
from a fresh GitHub clone. Human contributors can use the same workflow.

## 1. Read Before Editing

Read these files in order:

1. [`AGENTS.md`](../AGENTS.md) — invariants, repository map, and task entry points
2. [`CLAUDE.md`](../CLAUDE.md) — implementation pitfalls and package ownership
3. The nearest package `README.md`, source, and tests for the requested change

The non-negotiable boundaries are:

- Authorization decisions go through `PolicyGateway.intercept()`.
- Delegated tokens only narrow authority.
- Evidence ledger records are append-only and hash-chained.
- Request IDs are UUID v7; use `generateUUIDv7()`.
- Physical constraints belong in capability tokens.
- E-stop rolls back every non-terminal state without waiting for authorization.
- Fallible operations return `Result<T, E>` instead of throwing for control flow.

## 2. Establish a Clean Baseline

Prerequisites are Node.js 22+ and pnpm 9.15.0 (the version pinned by
`packageManager` in `package.json`). From a fresh clone:

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm install --frozen-lockfile
pnpm run verify
```

`verify` runs the full build, type-check, and test sequence. On an existing
checkout, inspect `git status --short --branch` before pulling or editing. Do
not overwrite unrelated local changes.

## 3. Find the Smallest Change Surface

Use the repository map in `AGENTS.md`. Search before inventing a new pattern:

```bash
rg "PolicyGateway|generateUUIDv7|Result<" packages apps
rg --files packages/<package-name>
```

Follow an adjacent implementation and its tests. Bridges translate requests;
they do not authorize them. New security invariants require conformance tests.

## 4. Work in a Tight Test Loop

Run the smallest relevant test while iterating:

```bash
pnpm --filter <workspace-package-name> test
pnpm --filter <workspace-package-name> typecheck
```

Before handoff, run:

```bash
pnpm run verify
```

Changes to fixtures, protocol enforcement, or release-critical behavior may
also require the CI certification gate:

```bash
pnpm run cert:fixtures
```

The GitHub Actions workflow is the source of truth for additional CI-only
checks.

## 5. Prepare the Pull Request

- Branch from `main` using `feat/<topic>` or `fix/<topic>`.
- Keep the change scoped to one issue or outcome.
- Add tests for behavior changes and docs for public API changes.
- Never amend a published commit or force-push `main`.
- Target `main` unless a maintainer names an active release branch.

In the handoff or PR description, report:

1. What changed and why
2. Files or packages affected
3. Exact validation commands and results
4. Known limitations or checks not run
5. Any pre-existing worktree changes or failures kept out of scope

## Common Failure Modes

- `crypto.randomUUID()` creates UUID v4, which fails SINT request validation.
- `CircuitBreaker.trip()` is a permanent manual trip; use `recordDenial()` when
  testing automatic recovery.
- Correct ledger data by appending a correction event, never by mutation.
- Do not duplicate `SintDeploymentProfile`; engine code uses
  `SintHardwareDeploymentProfile`.
- Do not make authorization decisions inside a route or bridge.
