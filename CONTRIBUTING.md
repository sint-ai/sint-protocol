# Contributing to SINT Protocol

Thank you for your interest in contributing to SINT Protocol. This document explains how to get involved.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/sint-protocol.git`
3. Install dependencies: `pnpm install` (requires Node.js 22+ and pnpm 9+)
4. Build all packages: `pnpm run build`
5. Run tests: `pnpm run test`

## Development Workflow

1. Create a feature branch from `main`: `git checkout -b feat/your-feature`
2. Make your changes
3. Run `pnpm run typecheck` and `pnpm run test` to verify
4. Commit with a clear message describing what and why
5. Push to your fork and open a Pull Request

## Code Standards

- **TypeScript strict mode** — no `any` types, no implicit returns
- **Result\<T, E\> over exceptions** — fallible operations return discriminated unions, not thrown errors
- **Interface-first persistence** — storage adapters implement clean interfaces
- **Vitest** for all tests — aim for meaningful coverage, not 100% line coverage
- **Zod** for runtime validation schemas

## Project Structure

```
sint-protocol/
├── apps/           # Deployable applications (gateway, MCP proxy, dashboard)
├── packages/       # Shared libraries (core, tokens, gateway, ledger, bridges)
├── scripts/        # Build and development scripts
└── docker-compose.yml
```

Each package has its own `package.json`, `tsconfig.json`, and test suite. Use `pnpm --filter @sint/<package> test` to run a single package's tests.

## What to Contribute

- **Bug fixes** — always welcome
- **Bridge adapters** — new integrations (gRPC, MQTT, HTTP webhooks)
- **Policy rules** — new forbidden combination patterns or tier escalation triggers
- **Persistence backends** — additional storage adapters
- **Documentation** — improvements, examples, tutorials
- **Conformance tests** — new security regression test cases

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Include tests for new functionality
- Update relevant documentation
- Ensure all existing tests pass
- Describe what changed and why in the PR description

## Reporting Issues

Use [GitHub Issues](https://github.com/sint-ai/sint-protocol/issues) to report bugs or request features. Include:

- What you expected to happen
- What actually happened
- Steps to reproduce
- Environment details (OS, Node.js version, pnpm version)

## Security Vulnerabilities

If you discover a security vulnerability, **do not** open a public issue. Instead, use [GitHub Security Advisories](https://github.com/sint-ai/sint-protocol/security/advisories) to report it privately. We will respond within 48 hours.

## Community

- [GitHub Discussions](https://github.com/sint-ai/sint-protocol/discussions) — questions, ideas, and general discussion
- Pull Request reviews — we aim to review PRs within one week

## License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 License.
