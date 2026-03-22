# SINT Protocol Module Map

This file is the canonical map of modules in the monorepo.

## Apps

- `apps/gateway-server` (`@sint/gateway-server`)
  - Role: HTTP policy gateway API, approvals, ledger query, metrics.
  - Key entry points: `src/index.ts`, `src/server.ts`, `src/routes/*`.

- `apps/sint-mcp` (`@sint/mcp`)
  - Role: security-first MCP proxy with downstream server aggregation and enforcement.
  - Key entry points: `src/index.ts`, `src/server.ts`, `src/enforcer.ts`, `src/aggregator.ts`.

- `apps/dashboard` (`@sint/dashboard`)
  - Role: approval and audit operator UI.
  - Key entry points: `src/main.tsx`, `src/App.tsx`, `src/components/*`.

## Packages

- `packages/core` (`@sint/core`)
  - Role: shared types, constants, Zod schemas.
  - Key paths: `src/types/*`, `src/constants/*`, `src/schemas/*`.

- `packages/capability-tokens` (`@sint/gate-capability-tokens`)
  - Role: token issue/delegate/validate/revoke and crypto helpers.
  - Key paths: `src/issuer.ts`, `src/delegator.ts`, `src/validator.ts`, `src/revocation.ts`.

- `packages/policy-gateway` (`@sint/gate-policy-gateway`)
  - Role: core authorization decision engine and tier/risk assignment.
  - Key paths: `src/gateway.ts`, `src/tier-assigner.ts`, `src/constraint-checker.ts`, `src/approval-flow.ts`.

- `packages/evidence-ledger` (`@sint/gate-evidence-ledger`)
  - Role: append-only hash-chained audit event store and proof receipts.
  - Key paths: `src/writer.ts`, `src/reader.ts`, `src/proof-receipt.ts`.

- `packages/bridge-mcp` (`@sint/bridge-mcp`)
  - Role: MCP session/interceptor/middleware integration.
  - Key paths: `src/mcp-interceptor.ts`, `src/mcp-session.ts`, `src/mcp-resource-mapper.ts`.

- `packages/bridge-ros2` (`@sint/bridge-ros2`)
  - Role: ROS2 request mapping, message typing, QoS modeling.
  - Key paths: `src/ros2-interceptor.ts`, `src/ros2-resource-mapper.ts`, `src/ros2-message-types.ts`.

- `packages/persistence` (`@sint/persistence`)
  - Role: storage interfaces plus in-memory and persistent adapters (PostgreSQL/Redis).
  - Key paths: `src/interfaces.ts`, `src/in-memory-*.ts`, `src/pg-*.ts`, `src/redis-*.ts`.

- `packages/client` (`@sint/client`)
  - Role: SDK for interacting with gateway APIs.
  - Key path: `src/sint-client.ts`.

- `packages/conformance-tests` (`@sint/conformance-tests`)
  - Role: security regression suites across bridges and core policy behavior.
  - Key paths: `src/security-regression.test.ts`, `src/bridge-mcp-regression.test.ts`, `src/bridge-ros2-regression.test.ts`.

## Docs and Governance Files

- `CLAUDE.md`: agent operating guidance and architecture constraints.
- `ARCHITECTURE.md`: system design and invariants.
- `MODULES.md`: module inventory and ownership map.
- `DECISIONS.md`: architecture decision records (create/update when architecture decisions are made).
- `CHANGELOG.md`: per-task change log (create/update when issues are completed).

## Update Rules

- Add/update this file whenever a module is added, removed, renamed, or materially repurposed.
- Keep package names and paths synchronized with `package.json` and workspace layout.
- Do not add utility modules without recording them here first.
