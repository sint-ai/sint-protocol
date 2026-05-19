# Open-RMF Handoff Policy Receipts

This guide is a small collaboration artifact for Open-RMF maintainers and
fleet-adapter authors.

It asks one narrow question: can fleet handoffs and facility actions carry
auditable policy receipts without requiring SINT to become an Open-RMF core
dependency?

## Fixture

The fixture is:

```text
packages/conformance-tests/fixtures/physical-ai/open-rmf-handoff-policy-receipts.v1.json
```

It covers:

- traffic reservation for a transfer cell
- task dispatch for cross-fleet payload handoff
- rejection of handoff evidence without a receipt
- door command during handoff
- emergency stop evidence

## Run The Check

```bash
pnpm --filter @pshkv/conformance-tests exec vitest run src/open-rmf-handoff-policy-receipts-conformance.test.ts
```

## Boundary

The fixture uses existing SINT Open-RMF bridge mapping helpers:

- `traffic.reserve` maps to `prepare` / `T1_prepare`
- `task.dispatch` maps to `call` / `T2_act`
- `door.command` maps to `call` / `T2_act`
- `emergency.stop` maps to `override` / `T3_commit`

The intent is not to move policy ownership into Open-RMF. The useful design
question is where a handoff receipt should live:

- at the RMF handoff layer
- inside a fleet adapter
- in an external facility policy system
- as a separate audit sidecar

## Receipt Shape

The fixture requires receipts to bind:

- attempted action
- resource URI
- RMF operation
- decision
- assigned tier
- payload reference
- source and target fleet
- source and target robot
- workspace
- decision digest
- hash-chain pointers
- timestamp

This is intentionally boring. A reviewer should be able to inspect one receipt
and answer: who tried to hand off what, where, under which policy decision, and
what evidence came before it?
