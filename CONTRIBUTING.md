# Contributing to SINT Protocol

Thank you for your interest in SINT Protocol! This document provides guidelines for contributing to the project.

## Getting Started

1. **Fork the repository** and clone your fork locally
2. **Install dependencies**: `pnpm install` (requires Node.js >= 22, pnpm >= 9)
3. **Build**: `pnpm run build`
4. **Run tests**: `pnpm run test` to verify everything works

## Development Workflow

1. Create a feature branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Make your changes, following the code style and design principles below
3. Add or update tests for your changes
4. Ensure all tests pass: `pnpm run test`
5. Ensure types check: `pnpm run typecheck`
6. Open a pull request against `main`

## Code Style & Design Principles

SINT Protocol follows strict conventions. Please review these before contributing:

- **TypeScript strict mode** — all code must pass strict type checking
- **Result\<T, E\> over exceptions** — fallible operations return discriminated unions, never throw
- **Interface-first persistence** — storage adapters implement clean interfaces
- **Single choke point** — every agent action flows through `PolicyGateway.intercept()`
- **Append-only audit** — the evidence ledger is INSERT-only with hash chain integrity
- **Attenuation only** — delegated tokens can only reduce permissions, never escalate
- **Physical safety first** — velocity, force, and geofence constraints are first-class

## Project Structure

The monorepo uses pnpm workspaces + Turborepo:

- `packages/` — core libraries (core, policy-gateway, capability-tokens, evidence-ledger, etc.)
- `apps/` — runnable applications (gateway-server, sint-mcp, dashboard)
- `packages/conformance-tests/` — security regression suite

## Types of Contributions

### Bug Reports

Open an issue with:
- A clear description of the bug
- Steps to reproduce
- Expected vs. actual behavior
- Environment details (Node version, OS, etc.)

### Feature Requests

Use [GitHub Discussions → Ideas](https://github.com/sint-ai/sint-protocol/discussions/categories/ideas) to propose new features. Include:
- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

### Integration Proposals

Building a bridge to a new platform (ROS 2, MQTT, gRPC, etc.)? Start a discussion in the [Integrations](https://github.com/sint-ai/sint-protocol/discussions/categories/integrations) category first to align on the approach.

### Pull Requests

- Keep PRs focused — one feature or fix per PR
- Include tests for new functionality
- Update documentation if your change affects the public API
- Reference any related issues in the PR description

## Testing

```bash
# Run all tests
pnpm run test

# Run tests for a specific package
pnpm --filter @sint/policy-gateway test
pnpm --filter @sint/mcp test

# Type-check without emitting
pnpm run typecheck
```

All PRs must pass the full test suite and type checking before merge.

## Security

If you discover a security vulnerability, **do not open a public issue**. Instead, email security@sint.ai with details. We take security seriously and will respond promptly.

## License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 License.

## Community

- [GitHub Discussions](https://github.com/sint-ai/sint-protocol/discussions) — questions, ideas, and general chat
- [Issues](https://github.com/sint-ai/sint-protocol/issues) — bug reports and tracked work

We welcome contributors of all experience levels. If you're unsure about anything, open a discussion — we're happy to help.
