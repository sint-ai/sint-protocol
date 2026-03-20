# Contributing to SINT Protocol

Thank you for your interest in contributing to SINT Protocol — the security enforcement layer for physical AI.

## Quick Start

```bash
# Fork and clone the repo
git clone https://github.com/<your-username>/sint-protocol.git
cd sint-protocol

# Install dependencies (requires Node.js >= 22, pnpm >= 9)
pnpm install

# Build all packages
pnpm run build

# Run all tests (370+)
pnpm run test

# Type-check
pnpm run typecheck
```

## Development Workflow

1. **Create a branch** from `master`:
   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** following the coding conventions below.

3. **Run tests** for the package you modified:
   ```bash
   pnpm --filter @sint/gate-policy-gateway test
   ```

4. **Run the full test suite** before submitting:
   ```bash
   pnpm run test
   ```

5. **Submit a pull request** against `master`.

## Coding Conventions

### TypeScript
- **Strict mode** — `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`
- **ES modules** — `"type": "module"` with `.js` extensions in imports
- **Readonly by default** — interface fields are `readonly`

### Error Handling
- **Result<T, E> — never throw** — All fallible operations return `{ ok: true, value: T } | { ok: false, error: E }`. Use `ok()` and `err()` helpers from `@sint/core`.
- Do not use try/catch for control flow.

### Validation
- **Zod at boundaries** — Runtime validation at all system boundaries (API inputs, config parsing, external data).

### Crypto
- Use `@noble/ed25519` and `@noble/hashes` only. No other crypto libraries.
- All IDs are UUIDv7 (sortable, timestamp-prefixed).
- All timestamps are ISO 8601 with microsecond precision.

### Testing
- **Vitest** with `describe`/`it`/`expect` pattern.
- Every new feature or bug fix must include tests.
- Conformance tests in `packages/conformance-tests` must pass on every PR.

## Architecture Rules

These are non-negotiable:

1. **Every action flows through `PolicyGateway.intercept()`** — No bridge, route, or service makes independent authorization decisions.
2. **Attenuation only** — Delegated capability tokens can only reduce permissions, never escalate.
3. **Append-only ledger** — The Evidence Ledger is insert-only. No updates, no deletes.
4. **Interface-first persistence** — Storage adapters implement interfaces from `@sint/persistence`.

## What We're Looking For

### High-Priority Contributions
- **New bridge adapters** — Extend SINT to protocols beyond MCP and ROS 2
- **Policy rule sets** — Industry-specific policies (manufacturing, healthcare, logistics)
- **Persistence adapters** — PostgreSQL, Redis, or other storage backends
- **Language SDKs** — Python, Go, Rust clients for the Gateway API
- **Documentation** — Tutorials, guides, architecture explanations

### Good First Issues
Look for issues labeled [`good first issue`](https://github.com/sint-ai/sint-protocol/labels/good%20first%20issue) — these are scoped, well-defined tasks suitable for new contributors.

## Adding a New Package

1. Create `packages/<name>/package.json` with `"name": "@sint/<name>"`
2. Create `packages/<name>/tsconfig.json` extending `../../tsconfig.base.json`
3. Create `packages/<name>/vitest.config.ts`
4. Create `packages/<name>/src/index.ts` with exports
5. Add dependency references to `tsconfig.json`
6. Run `pnpm install` to link workspace dependencies

## Commit Messages

Use conventional commits:
```
feat(policy-gateway): add geofence polygon constraint
fix(evidence-ledger): handle empty chain initialization
docs(readme): update package table with test counts
test(bridge-mcp): add forbidden combo detection tests
```

## Pull Request Process

1. Ensure all tests pass (`pnpm run test`).
2. Ensure type-check passes (`pnpm run typecheck`).
3. Update relevant documentation if your change affects the public API.
4. Add your changes to the relevant package's test suite.
5. Conformance tests must still pass.
6. One approval required from a maintainer.

## Security Vulnerabilities

**Do NOT open a public issue for security vulnerabilities.**

Email security reports to: **i@pshkv.com** with subject line `[SINT-SECURITY]`.

We will acknowledge within 48 hours and provide a timeline for fix and disclosure.

## Code of Conduct

Be respectful. Be constructive. Focus on the technical merit of contributions. We're building critical safety infrastructure — precision and rigor matter more than speed.

## License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 license.

---

Questions? Open a [Discussion](https://github.com/sint-ai/sint-protocol/discussions) or reach out at i@pshkv.com.
