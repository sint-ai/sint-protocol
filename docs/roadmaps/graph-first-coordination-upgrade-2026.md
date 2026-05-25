# Graph-First Coordination Upgrade (2026)

This roadmap converts the "graph-first coordination layer" market signal into a
concrete SINT execution track.

Positioning target:

- generation systems propose plans
- SINT governs whether plans are allowed to coordinate and execute in physical
  environments

## Why This Upgrade

SINT already has the hard enforcement primitives:

- capability tokens
- `PolicyGateway.intercept()` choke point
- append-only evidence ledger
- tiered approval and physical constraints

The upgrade is to add a first-class coordination graph surface that makes
multi-party workflows queryable, auditable, and interoperable.

## Outcome By End Of 2026

- graph-native evidence model over existing SINT receipts/events
- multi-party coordination session profile with explicit responsibility edges
- policy and settlement views that are graph-addressable
- one external-facing integration demo that proves cross-org coordination trace

## Phase 1 (0-30 Days): Graph Foundation

### Deliverables

1. `CoordinationGraph` schema
2. `CoordinationNode` and `CoordinationEdge` taxonomy
3. graph projection rules from existing ledger events
4. report artifact: "request -> decision -> approval -> execution -> rollback"
   as a graph path

### Proposed Schema Surfaces

- `docs/specs/coordination-graph.schema.json`
- `docs/specs/coordination-node-taxonomy.md`
- `docs/specs/coordination-edge-taxonomy.md`

### Acceptance

- one conformance test asserts graph projection determinism from fixture events
- one docs report demonstrates a full path query for a T2/T3 action

## Phase 2 (30-60 Days): Multi-Party Session Profile

### Deliverables

1. `CoordinationSession` object:
   session id, participants, roles, delegated scopes, approval boundaries
2. responsibility-chain receipts:
   who authorized, who executed, who overrode, who rolled back
3. session-level policy checks:
   forbidden edge combinations and escalation triggers

### Proposed Schema Surfaces

- `docs/specs/coordination-session.schema.json`
- `docs/specs/responsibility-chain-receipt.schema.json`

### Acceptance

- conformance fixtures for:
  - cross-team handoff
  - deny with positive receipt
  - e-stop rollback with backward link to original action
- docs guide for session-level audit replay

## Phase 3 (60-90 Days): Economic + Interop Layer

### Deliverables

1. graph-addressable settlement profile:
   attach settlement shares to session/action graph nodes
2. adapter mappings:
   ROS2/MCP/A2A/Open-RMF into shared graph node+edge references
3. external demo artifact:
   one cross-adapter scenario with graph evidence export

### Proposed Schema Surfaces

- `docs/specs/coordination-settlement-profile.schema.json`
- `docs/guides/graph-coordination-evidence-export.md`

### Acceptance

- single conformance fixture produces:
  - coordination graph path
  - policy receipt chain
  - settlement attribution references

## Priority Issues To Open

1. Graph schema + projection rules
2. Coordination session profile
3. Responsibility-chain receipt profile
4. Graph query API route (`/v1/coordination/graph`)
5. Cross-adapter graph reference mapping fixture
6. Graph settlement profile

## Metrics

- projection determinism: same event set -> same graph hash
- trace completeness: 100% of T2/T3 outcomes map to graph path artifacts
- responsibility coverage: every approval/override/rollback has actor edge
- external reuse: at least one non-core collaborator references the graph schema

## Non-Goals

- replacing existing policy gateway enforcement with graph inference
- building a new workflow orchestrator
- speculative token-economics expansion without deployment evidence

## Strategic Message

Use this category line:

`SINT is the enforcement-grade coordination control plane for physical AI.`

Use this technical line:

`SINT turns multi-agent coordination into permissioned graph paths with signed receipts, human override boundaries, and auditable execution traces.`
