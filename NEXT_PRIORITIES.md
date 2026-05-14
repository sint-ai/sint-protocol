# SINT Protocol - Next Priorities

The repo has enough breadth now that the next milestone should not be "another bridge." The next milestone should be "a production-worthy first surface."

Current roadmap state:

- Consumer smart home, Matter/human-aware, health fabric, and MQTT QoS slices are shipped.
- Emergency bypass and duress-token controls are implemented and documented.
- The remaining roadmap should run through a production-readiness gate before more breadth is added.

This file replaces the earlier feature-first ordering with a production-first sequence:

1. Make the current core trustworthy.
2. Define the smallest supported production slice.
3. Add release and operational gates around that slice.
4. Only then resume broader roadmap expansion.

## Current Direction

The best candidate for a production starting point is:

- `packages/capability-tokens`
- `packages/policy-gateway`
- `packages/persistence`
- `packages/evidence-ledger`
- one operator-facing entrypoint:
  `packages/sint-pdp-interceptor` or `apps/gateway-server`

This gives SINT a coherent first story: issue a token, enforce policy, persist the decision trail, and expose a stable integration surface.

## Priority Order

### 1. Reliability Blockers

These are release blockers for any production claim:

- Canonical signing payload must survive nested JSON reordering and storage round-trips.
- Persistence must preserve the full capability-token shape.
- `main` CI must be green on a fresh run, not only historically green on one SHA.
- Schema bootstrap and migrations must be forward-safe for existing deployments.

Status in this checkout:

- `computeSigningPayload()` now uses recursive canonical JSON serialization.
- Token issuance and Postgres persistence now preserve:
  `behavioralConstraints`, `passportId`, `delegationDepth`,
  `modelConstraints`, `attestationRequirements`,
  `verifiableComputeRequirements`, `executionEnvelope`,
  and `revocationEndpoint`.
- Regression tests now cover canonical payload stability and full token persistence.
- `apps/gateway-server/__tests__/production-slice.test.ts` now covers the
  minimal supported HTTP path:
  token issuance, policy enforcement, ledger persistence, proof generation,
  and revocation fail-closed behavior.

### 2. Production Slice Definition

Before adding new domains, freeze the first supported slice:

- Supported runtime:
  Node 22 + pnpm 9
- Supported persistence:
  Postgres for token and ledger durability
- Supported ingress:
  policy gateway / interceptor path
- Supported guarantees:
  signature validation, policy enforcement, audit durability, revocation flow

Out of scope for the first production slice:

- every bridge package
- every roadmap phase
- speculative market-expansion work
- broad docs promises that exceed tested behavior

### 3. Release Gates

Do not call the project production-ready until all of these are true:

- `pnpm run build` succeeds from a clean checkout
- targeted package tests pass for the production slice
- at least one end-to-end happy path is scripted and repeatable
- database schema bootstrap is idempotent
- docs site build succeeds
- release checklist exists and is used
- rollback / migration notes exist for persistence changes

### 4. Operational Hardening

Next hardening work should focus on:

- environment-variable contract and config docs
- startup health/readiness behavior
- structured logging for gateway decisions
- metrics around allow / deny / escalate / verify failures
- explicit error taxonomy for operator-facing surfaces
- deployment reference for a single supported topology

### 5. Resume Feature Expansion

After the production slice is stable, resume roadmap expansion in this order:

1. complete adjacent core bridges already close to usable
2. improve observability and operator workflows
3. ship one new domain at a time with tests and docs

That means Phase 3/4/6 work stays valuable, but it moves behind reliability and supportability. Phase 7 safety work that has already landed should be treated as part of the supported core only after the release gates verify it.

## Immediate Execution Queue

### Sprint A

- keep token canonicalization and persistence fixes merged and verified
- fresh CI pass on `main`
- keep the end-to-end production-slice verification path green
- confirm docs build and package build from clean checkout

### Sprint B

- document supported production topology
- add release checklist and migration notes
- tighten gateway health/readiness and operator-facing failure modes

### Sprint C

- pick exactly one next expansion area after the core slice is stable
- prefer adjacent work over entirely new market surfaces

## Decision Rule

If a task makes the core slice more reliable, testable, operable, or supportable, it comes first.

If a task mostly increases roadmap breadth, it waits until the release gates are green.
