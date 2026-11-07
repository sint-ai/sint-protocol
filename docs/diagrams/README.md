# SINT Protocol — diagrams

Seven diagrams that explain the protocol to someone meeting it for the first
time. Each one is checked against the source before it is drawn; the file it
was derived from is printed along the bottom of the rendered SVG and in the
header comment of the Mermaid source.

| # | Diagram | Source | Rendered | Derived from |
|---|---------|--------|----------|--------------|
| 1 | System context | [`01-system-context.mmd`](01-system-context.mmd) | [SVG](svg/01-system-context.svg) | `packages/policy-gateway/src/gateway.ts`, `packages/bridge-*/src/*-interceptor.ts`, `packages/evidence-ledger/src/writer.ts` |
| 2 | Lifecycle of one `SintRequest` | [`02-request-lifecycle.mmd`](02-request-lifecycle.mmd) | [SVG](svg/02-request-lifecycle.svg) | `gateway.ts` (`intercept` L647, `evaluateRequest` L667, `decideBytier` L1752), `tier-assigner.ts`, `constraint-checker.ts`, `forbidden-combos.ts`, `plugin-failures.ts`, `regulated-data-policy.ts` |
| 3 | The T0–T3 approval ladder | [`03-tier-ladder.mmd`](03-tier-ladder.mmd) | [SVG](svg/03-tier-ladder.svg) | `packages/core/src/types/policy.ts`, `packages/core/src/constants/tiers.ts`, `packages/core/src/constants/forbidden-combos.ts`, `tier-assigner.ts` |
| 4 | Capability token delegation | [`04-token-delegation.mmd`](04-token-delegation.mmd) | [SVG](svg/04-token-delegation.svg) | `packages/capability-tokens/src/delegator.ts`, `packages/core/src/types/capability-token.ts` |
| 5 | The evidence ledger | [`05-evidence-ledger.mmd`](05-evidence-ledger.mmd) | [SVG](svg/05-evidence-ledger.svg) | `packages/evidence-ledger/src/writer.ts`, `packages/core/src/types/evidence.ts` |
| 6 | Package layering | [`06-package-graph.mmd`](06-package-graph.mmd) | [SVG](svg/06-package-graph.svg) | the workspace dependency lists in `packages/*/package.json` and `apps/gateway-server/package.json` |
| 7 | Defence map, OWASP ASI01–ASI10 | [`07-defence-map.mmd`](07-defence-map.mmd) | [SVG](svg/07-defence-map.svg) | `docs/conformance/owasp-asi-mapping.md`, `packages/policy-gateway/src/index.ts` |

State machines for the approval queue, the policy decision flow and revocation
live in [`state-machine-mermaid.md`](state-machine-mermaid.md).

## Two formats, on purpose

The `.mmd` files are the reviewable source: they diff cleanly and GitHub
renders them inline. The SVGs under `svg/` are the presentation rendering —
hand-laid out for density that Mermaid's auto-layout will not give, and
reproducible from the small Python renderers in `tools/`.

```bash
cd docs/diagrams/tools
for f in render_0*.py; do python3 "$f"; done
```

The renderers need nothing but Python 3 — no browser, no Mermaid CLI, no
network. `svgkit.py` holds the shared palette and layout helpers.

## Light and dark

Every SVG declares its colours as CSS custom properties and flips them on
`prefers-color-scheme`, so one file reads correctly on a light or a dark page.
A renderer that ignores the media query gets the light palette and an explicit
surface rect behind the text, so it stays legible either way.

## Naming note

The published npm scope is `@pshkv/*` — that is what the `package.json`
manifests say, and that is what the diagrams use. The dependency graph in the
repository root `CLAUDE.md` writes the same packages as `@sint/*`; so do the
`@module` doc comments inside the gate packages. Those are stale. Directory
names also differ from package names for the gate packages:
`packages/policy-gateway` builds `@pshkv/gate-policy-gateway`,
`packages/capability-tokens` builds `@pshkv/gate-capability-tokens`, and
`packages/evidence-ledger` builds `@pshkv/gate-evidence-ledger`.
