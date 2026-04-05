# External Contributor Onboarding

This guide is the fast path from "first visit" to "first merged PR".

## Target Outcome

A new contributor completes:

1. Local setup
2. One scoped issue
3. One merged PR

within 1-2 days.

## Starter Path

1. Fork and clone `sint-ai/sint-protocol`
2. Install deps: `pnpm install`
3. Validate baseline: `pnpm run build && pnpm run test`
4. Pick one `good first issue` with clear acceptance criteria
5. Create branch: `codex/<short-task-name>`
6. Implement + update docs/tests
7. Open PR using the repository template

## Suggested First Issues

- Docs corrections in guides/tutorials
- New conformance fixture cases
- Small bridge mapping improvements
- Dashboard UX polish for approval/evidence views

## Maintainer SLA

- First response: within 24h
- First review pass: within 48h
- Merge-ready decision: within 72h

## First PR Checklist

- [ ] Scope matches issue acceptance criteria
- [ ] Tests or fixtures updated where behavior changed
- [ ] Docs updated for protocol/runtime-facing changes
- [ ] `pnpm run build` passes
- [ ] PR description links issue and validation commands

## Contributor Recognition

- Add contributor to release notes credits
- Highlight first merged PR in monthly bulletin
- Offer next-step issue with incremental complexity
