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
