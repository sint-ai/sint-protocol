# Solar Field Operations Policy Receipts

This guide is a small collaboration artifact for solar field robotics teams.

It asks one narrow question: where should inspection, cleaning, and
installation-support robots pick up auditable policy receipts?

## Fixture

The fixture is:

```text
packages/conformance-tests/fixtures/physical-ai/solar-field-operations-policy-receipts.v1.json
```

It covers:

- thermal inspection inference before actuation
- staging a cleaning route plan
- routing cleaning motion through the ROS 2 motion boundary
- routing installation tooling through the ROS 2 joint command boundary
- escalating cleaning motion when a human is in the service aisle
- rejecting motion when weather or surface permit evidence is missing
- rejecting installation actuation when lockout-tagout evidence is missing

## Run The Check

```bash
pnpm --filter @pshkv/conformance-tests exec vitest run src/solar-field-operations-policy-receipts-conformance.test.ts
```

## Boundary

The fixture uses existing SINT execution and ROS 2 boundaries:

- `engine://system1/panel_inspection` for inspection inference
- `engine://system2/plan` for route and task staging
- `/cmd_vel` mapping to `ros2:///cmd_vel` for crawler or quadruped motion
- `/joint_commands` mapping to `ros2:///joint_commands` for installation tooling

The policy shape is intentionally conservative:

- inspection inference is `T0_observe`
- route planning is `T1_prepare`
- cleaning motion and installation tooling are `T2_act`
- human presence in the aisle escalates motion to `T3_commit`
- missing weather permits deny motion evidence
- missing lockout-tagout evidence denies installation evidence

## Receipt Shape

The receipt binds:

- attempted action
- execution or ROS 2 resource
- decision
- assigned tier
- site and row identity
- robot identity
- mission type
- weather permit reference
- lockout-tagout permit reference
- workspace
- decision digest
- hash-chain pointers
- timestamp

The design goal is boring traceability. A reviewer should be able to inspect
one receipt and answer: which field robot attempted which action on which row,
under which safety permits, and what policy decision allowed, denied, or
escalated it?
