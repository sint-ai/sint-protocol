# SINT Protocol Architecture

This document defines the current system architecture for the SINT Protocol monorepo.

## 1. System Purpose

SINT is a security enforcement layer between AI agents and high-impact operations (tool calls, code execution, robot actions). The architecture guarantees that authorization, constraints, and auditability are enforced before side effects occur.

## 2. Top-Level Components

- `apps/sint-mcp` (`sint-mcp`): MCP proxy that mediates upstream clients and downstream MCP servers.
- `apps/gateway-server` (`@pshkv/gateway-server`): HTTP API for interception, token ops, approvals, ledger query, and metrics.
- `apps/dashboard` (`@pshkv/dashboard`): operator UI for pending approvals and audit visibility.

Core packages:

- `packages/core` (`@pshkv/core`): shared types, schemas, constants.
- `packages/capability-tokens` (`@pshkv/gate-capability-tokens`): Ed25519 token issue/delegate/validate/revoke.
- `packages/policy-gateway` (`@pshkv/gate-policy-gateway`): policy engine and interception decisions.
- `packages/evidence-ledger` (`@pshkv/gate-evidence-ledger`): hash-chained append-only evidence log.
- `packages/bridge-mcp` (`@pshkv/bridge-mcp`): MCP call-to-SINT request mapping.
- `packages/bridge-ros2` (`@pshkv/bridge-ros2`): ROS2 action mapping and physics-context extraction.
- `packages/persistence` (`@pshkv/persistence`): storage interfaces plus in-memory, PostgreSQL, and Redis adapters.
- `packages/client` (`@pshkv/client`): TS client SDK for gateway APIs.
- `packages/conformance-tests` (`@pshkv/conformance-tests`): regression suite for security invariants.

## 3. Decision Flow

1. A request enters via MCP bridge, ROS2 bridge, or HTTP endpoint.
2. Request is normalized into `SintRequest` semantics.
3. `PolicyGateway.intercept()` computes decision: `allow`, `deny`, `escalate`, or `transform`.
4. Decision and context are written to the evidence ledger.
5. If escalation is required, approval queue + dashboard/API workflows handle resolution.
6. Caller receives final outcome with any applied constraints.

## 4. Security Invariants

These are architectural invariants and must remain true:

- Single choke point: all authorization passes through `PolicyGateway.intercept()`.
- Attenuation-only delegation: delegated tokens can only reduce privileges.
- Append-only ledger: events are never updated/deleted after insertion.
- Explicit fallibility model: operations return result objects; avoid exception-driven control flow.
- Tiered approvals: T0/T1 auto paths, T2/T3 escalation paths with human/ops controls.

## 5. Data and State Boundaries

- Token lifecycle state: issuance, delegation chains, revocation status.
- Policy decision state: assigned tiers, risk classification, escalation metadata.
- Evidence state: hash-linked event history and proof receipts.
- Approval state: pending and resolved decisions, streamed via SSE for operators.

## 6. Deployment View

Primary runtime surfaces:

- Gateway API on HTTP (health, intercept, tokens, approvals, ledger, metrics).
- MCP proxy via stdio/SSE integration with upstream MCP clients.
- Dashboard as separate UI process, polling/streaming against gateway.
- Storage is interface-driven; in-memory for tests/dev, PostgreSQL/Redis for persistent deployments.

## 7. Change Rules

When architecture changes:

1. Update this file.
2. Update `CLAUDE.md` if agent guidance changes.
3. Add an ADR entry in `docs/tsc/DECISIONS.md` for architectural choices.
4. Ensure conformance tests cover new security-relevant behavior.
