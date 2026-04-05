# RFC: SINT Protocol Design Baseline (2026)

## Status

- Draft
- Owner: SINT maintainers
- Tracking issue: #22

## Problem

Agent ecosystems now have strong standards for:

- agent-to-tool (`MCP`)
- agent-to-agent (`A2A`)

But they still lack a portable, enforceable governance layer for real-world execution.
SINT defines this missing control plane.

## Scope

SINT covers:

- delegated authority via capability tokens
- runtime policy enforcement at a single choke point
- deterministic tiering and human escalation
- append-only evidence with chain-of-custody
- bridge profiles for physical and industrial protocols

SINT does not replace robot safety PLCs or orchestration runtimes.

## Core Invariants

1. All execution paths pass through `PolicyGateway.intercept()`.
2. Tokens are attenuation-only (child scope cannot exceed parent scope).
3. Evidence is append-only and hash chained.
4. Revocation must never fail open for T2/T3 actions.

## Protocol Surfaces

- Discovery: `GET /.well-known/sint.json`
- Schemas: `GET /v1/schemas`, `GET /v1/schemas/:name`
- Compliance mapping: `GET /v1/compliance/tier-crosswalk`
- Runtime API: intercept, approvals, tokens, ledger
- Real-time approvals:
  - SSE: `/v1/approvals/events`
  - WebSocket: `/v1/approvals/ws`

## Standards Positioning

- MCP remains tool-call protocol.
- A2A remains inter-agent protocol.
- SINT provides delegated authority, runtime safety policy, and evidence.

## Compliance Mapping

SINT tiers are mapped in the protocol crosswalk to:

- NIST AI RMF
- ISO/IEC 42001
- EU AI Act (agentic/high-risk execution contexts)

## Open Questions

1. gRPC bridge conformance profile depth for v0.3.
2. Conformance certification scope for external bridge implementations.
3. Governance cadence for SIP/RFC acceptance.

## Acceptance Criteria

- Publish this RFC in docs.
- Keep crosswalk endpoint and schema in sync with implementation.
- Maintain conformance fixtures for bridge/profile additions.

