# Developer Documentation Site (`docs.sint.gg`)

This guide describes the VitePress-powered developer docs site and how to run/publish it.

## Local Development

```bash
pnpm install
pnpm run docs:dev
```

Open: `http://localhost:5173`

## Build and Preview

```bash
pnpm run docs:build
pnpm run docs:preview
```

Build output: `docs/.vitepress/dist`

## Deployment

The site is published by GitHub Actions workflow:

- Workflow: `.github/workflows/docs-site.yml`
- Trigger: push to `main` when docs or docs tooling changes
- Target: GitHub Pages with custom domain `docs.sint.gg`

Branch deploy note:

- feature branches can validate docs with `pnpm run docs:build`
- GitHub Pages environment rules may reject deployments from non-`main` branches
- if you need the public site updated, merge the docs change to `main`

Runtime warning note:

- if the `Deploy` step logs only a `punycode` deprecation warning and the job
  still succeeds, treat it as a non-blocking upstream GitHub Pages action
  warning rather than a docs build regression
- current source of that warning is the `actions/deploy-pages` dependency chain
  through `@actions/artifact -> @azure/core-http -> node-fetch@2 -> whatwg-url`
- if the workflow starts failing or the warning surface changes, re-check the
  latest `actions/deploy-pages` release before changing the site build

## Content Organization

- Root docs landing page: `docs/index.md`
- Site config and theme: `docs/.vitepress/`
- Static assets and domain binding: `docs/public/`

## Updating Navigation

Edit `docs/.vitepress/config.mts` to update:

- Top nav links
- Sidebar grouping
- Footer text
- Edit-on-GitHub URL
