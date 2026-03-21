# Contributing to SINT Protocol

Thanks for your interest in SINT. This guide covers everything you need to get started.

## Getting Started

```bash
# Prerequisites: Node.js >= 22, pnpm >= 9
git clone https://github.com/sint-ai/sint-protocol.git
cd sint-protocol
pnpm install
pnpm run build
pnpm run test          # All 370 tests should pass
```

## Development Workflow

1. **Fork and branch.** Create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature
   ```

2. **Make changes.** Follow the conventions below.

3. **Test.** Run the full suite:
   ```bash
   pnpm run test
   ```
   Or test a single package:
   ```bash
   pnpm --filter @sint/gate-policy-gateway test
   ```

4. **Type-check:**
   ```bash
   pnpm run typecheck
   ```

5. **Open a PR** against `main` with a clear description of what changed and why.

## Code Conventions

- **TypeScript strict mode** — `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters` are all enabled.
- **ES modules** — All packages use `"type": "module"`. Use `.js` extensions in imports (even for `.ts` source files).
- **`Result<T, E>` over exceptions** — All fallible operations return `{ ok: true, value: T } | { ok: false, error: E }`. Use `ok()` and `err()` from `@sint/core`. Never throw for control flow.
- **Readonly by default** — Interface fields should be `readonly`.
- **Zod for validation** — Runtime validation at system boundaries (API inputs, config parsing).
- **Vitest for testing** — `describe` / `it` / `expect` pattern.
- **@noble for crypto** — Ed25519 and SHA-256 only via `@noble/ed25519` and `@noble/hashes`.
- **UUIDv7 for IDs** — Sortable, timestamp-prefixed identifiers.
- **ISO 8601 timestamps** — Microsecond precision.

## Architecture Rules

These are non-negotiable. PRs that violate them will be rejected.

1. **Every action flows through `PolicyGateway.intercept()`.** No bridge, route handler, or service makes authorization decisions independently.
2. **Attenuation only.** Delegated tokens can only reduce permissions. Escalation is a protocol violation.
3. **Append-only ledger.** The evidence ledger supports `append()` and `query()`. No updates, no deletes.
4. **Interface-first persistence.** Storage adapters implement interfaces from `@sint/persistence`. Don't import concrete implementations outside of tests and DI setup.

## Proposing Changes (RFC Process)

For substantial changes to the protocol, architecture, or public API, we use a lightweight RFC (Request for Comments) process:

1. **Open a Discussion.** Start a thread in [GitHub Discussions](https://github.com/sint-ai/sint-protocol/discussions) under the "RFC" category. Describe the problem, your proposed solution, and trade-offs.
2. **Gather feedback.** Allow at least one week for community and maintainer input.
3. **Reach consensus.** A maintainer will mark the discussion as accepted, rejected, or needs-revision. Accepted RFCs get a tracking issue.
4. **Implement.** Open a PR referencing the RFC discussion and tracking issue.

Not every change needs an RFC. Bug fixes, documentation improvements, test additions, and small enhancements can go directly to a PR. When in doubt, open an issue first.

**Examples of changes that warrant an RFC:**
- New protocol primitives (e.g., a new task state, a new governance tier)
- Changes to the heartbeat or checkout model
- New bridge adapters for external systems
- Breaking changes to the public API or type definitions

## What to Work On

Check the [issue tracker](https://github.com/sint-ai/sint-protocol/issues) for open issues. Good first issues are labeled `good-first-issue`.

Areas where contributions are especially welcome:

- **New bridge adapters** — gRPC, MQTT, CAN bus, or any protocol where AI agents interact with physical systems.
- **Storage backends** — PostgreSQL and Redis adapters for the persistence layer.
- **Tier rules** — Domain-specific tier assignment rules for robotics, financial, healthcare, or other verticals.
- **Forbidden combos** — New dangerous action sequences that the community identifies.
- **Documentation** — Protocol spec improvements, examples, tutorials.
- **Conformance tests** — Additional security regression tests.

## Adding a New Package

1. Create `packages/<name>/package.json` with `"name": "@sint/<name>"`
2. Create `packages/<name>/tsconfig.json` extending `../../tsconfig.base.json`
3. Create `packages/<name>/vitest.config.ts`
4. Create `packages/<name>/src/index.ts`
5. Add dependency references in `tsconfig.json`
6. Run `pnpm install` to link workspace dependencies
7. Add the package to the table in `README.md`

## Adding a New Bridge

1. Create `packages/bridge-<protocol>/` following the package template above.
2. Implement request normalization: translate protocol-specific actions into `SintRequest`.
3. Implement decision forwarding: translate `PolicyDecision` back into protocol-specific responses.
4. Add conformance tests in `packages/conformance-tests/`.
5. Document the bridge in `PROTOCOL.md` section 9.

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(bridge-mcp): add per-server maxTier enforcement
fix(policy-gateway): handle empty recentActions in combo detection
docs: update PROTOCOL.md with approval flow timeout behavior
test(conformance): add forbidden combo regression tests
```

## Pull Request Checklist

- [ ] All tests pass (`pnpm run test`)
- [ ] Type-check passes (`pnpm run typecheck`)
- [ ] Conformance tests pass (`pnpm --filter @sint/conformance-tests test`)
- [ ] New code has tests
- [ ] Architecture rules are respected
- [ ] PR description explains what and why

## Code of Conduct

All participants in the SINT Protocol community are expected to be respectful and constructive. Welcome newcomers, focus on what is best for the community and the protocol, and avoid harassment, discrimination, or personal attacks.

## Reporting Security Issues

If you find a security vulnerability, **do not open a public issue**. Email security@sint.ai with details and we'll respond within 48 hours.

## License

By contributing, you agree that your contributions will be licensed under Apache-2.0.
