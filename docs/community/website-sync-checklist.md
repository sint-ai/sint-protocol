# Website Sync Checklist

Use this when updating public-facing SINT content across the repo docs and the
main website.

## Two Different Surfaces

### `docs.sint.gg`

Repo-backed docs surface.

- Source: `/docs`
- Build: `pnpm run docs:build`
- Workflow: `.github/workflows/docs-site.yml`
- Deploy rule: publishes from `main` via GitHub Pages environment rules

Important:

- feature branches can validate docs locally and in CI
- feature branches do not automatically deploy to `docs.sint.gg`
- if a branch-triggered deploy is attempted, GitHub Pages environment rules may
  reject it
- a successful `Deploy` step may still log a `punycode` deprecation warning
  from upstream GitHub Pages action dependencies; treat that as non-blocking
  unless the deploy itself fails

### `sint.gg`

Main marketing and product website.

- Current owner surface: Lovable
- Not deployed from this repo alone
- Pages like `/protocol` and `/roadmap` need manual or Lovable-driven updates

## Current Source Of Truth Files

For protocol and roadmap updates, use:

- `README.md`
- `docs/protocol.md`
- `docs/roadmap.md`
- `docs/roadmaps/end-of-year-2026-execution-plan.md`
- `docs/community/lovable-sint-gg-refresh-prompt.md`

## Recommended Update Flow

1. Update repo-backed source files first.
2. Run `pnpm run docs:build`.
3. Push branch and merge to `main`.
4. Let `docs-site.yml` publish the docs site from `main`.
5. Use the Lovable prompt to update `sint.gg/protocol` and `sint.gg/roadmap`.
6. Compare the live site against the repo-backed docs and remove copy drift.

## Current Manual Handoff Files

- protocol site refresh prompt:
  `docs/community/lovable-sint-gg-refresh-prompt.md`
- Sunnybotics and collaboration positioning:
  `docs/community/sunnybotics-collaboration-brief.md`
- active roadmap:
  `docs/roadmap.md`
- end-of-year execution plan:
  `docs/roadmaps/end-of-year-2026-execution-plan.md`

## Don’t Do This

- do not treat feature-branch Pages deploy failures as docs build failures
- do not update `sint.gg` copy without checking the repo-backed docs first
- do not hardcode brittle counts or time-sensitive claims unless they are being
  actively maintained
