# Contributing to SINT Protocol

Thank you for helping make physical AI safer.

## Ways to Contribute

### 1. Implement a bridge adapter

New bridge = new protocol integration. See `packages/bridge-iot/` as a minimal template.

**High-value bridges not yet built:**
- PROFINET / EtherCAT / CANopen / Modbus TCP (industrial fieldbus)
- DDS / RTPS (ROS 2 native transport layer)
- MQTT 5 with shared subscriptions (fleet telemetry)
- WebRTC data channels (browser-based operator consoles)

Each bridge needs:
- `src/<protocol>-resource-mapper.ts` — URI + action mapping
- `src/<protocol>-interceptor.ts` — session + intercept logic
- `__tests__/<protocol>.test.ts` — ≥15 tests covering allow/deny/escalate paths

### 2. Add conformance tests

Every new security invariant needs a test in `packages/conformance-tests/src/`.
Canonical fixtures (JSON) live in `packages/conformance-tests/fixtures/`.

Use the [bridge conformance issue template](.github/ISSUE_TEMPLATE/bridge_conformance.md) to report results.

### 3. Port an SDK

| Language | Status | Issue |
|---|---|---|
| TypeScript | ✅ `sdks/typescript/` | — |
| Python | stub at `sdks/python/` | [#4](https://github.com/pshkv/sint-protocol/issues/4) |
| Go | stub at `sdks/go/` | — |
| Rust | not started | open an issue |

### 4. Report a security vulnerability

See [SECURITY.md](SECURITY.md).

### 5. Submit a SINT Improvement Proposal (SIP)

See [docs/SIPS.md](docs/SIPS.md) and use the template at [docs/sips/0000-template.md](docs/sips/0000-template.md).

---

## Development Setup

```bash
git clone https://github.com/pshkv/sint-protocol
cd sint-protocol
pnpm install
pnpm run build
pnpm run test        # Must be 0 failures before and after your change
```

**Node.js ≥ 22 and pnpm ≥ 9.15 required.**

## Before Submitting a PR

1. `pnpm run build` — zero TypeScript errors
2. `pnpm run test` — all 1,105+ existing tests pass
3. New functionality has unit tests in its own package
4. New security-relevant behaviour has a test in `@sint/conformance-tests`
5. New bridge adapter exports types from its `src/index.ts`

## Code Style

- **TypeScript strict mode** — `noUncheckedIndexedAccess`, `noUnusedLocals`
- **`Result<T, E>` pattern** — never throw for control flow; use `ok()` / `err()` from `@sint/core`
- **Readonly interfaces** by default
- **Zod schemas** at system boundaries (external input, API surface)
- **`@noble/ed25519`** for all Ed25519 operations (audited, zero-dep)
- **UUID v7** for all IDs — use `generateUUIDv7()` from `@sint/gate-capability-tokens`, never `crypto.randomUUID()` (that gives v4)

## Multi-Agent / AI Pair Programming

This repo is designed for parallel human + AI development. See [AGENTS.md](AGENTS.md) for AI-specific guidance and [CLAUDE.md](CLAUDE.md) for implementation details and common pitfalls.

**Package ownership by focus area** (to avoid conflicts):

| Area | Packages |
|---|---|
| Security core | `@sint/core`, `@sint/gate-*` |
| Bridges | `@sint/bridge-*` — each is independent |
| Engine | `@sint/engine-*` |
| Server / client | `@sint/gateway-server`, `@sint/client` |
| Conformance | `@sint/conformance-tests` |

## Questions?

Open an [issue](https://github.com/pshkv/sint-protocol/issues) or comment on an existing one.
For real-time discussion, reference the [A2A #1713](https://github.com/a2aproject/A2A/issues/1713) thread where SINT and APS are coordinating on joint physical AI governance.
