# LeRobot Policy Actuation Receipts

This guide is a small collaboration artifact for LeRobot maintainers and robot
learning integrators.

It asks one narrow question: where should a learned policy checkpoint and
rollout become auditable execution on a real robot?

## Fixture

The fixture is:

```text
packages/conformance-tests/fixtures/physical-ai/lerobot-policy-actuation-receipts.v1.json
```

It covers:

- staging a learned-policy rollout before execution
- routing learned-policy execution through the engine execute boundary
- binding real joint-command actuation to the rollout receipt
- escalating learned actuation when a human is in the workspace
- rejecting a silent checkpoint swap after approval

## Run The Check

```bash
pnpm --filter @pshkv/conformance-tests exec vitest run src/lerobot-policy-actuation-receipts-conformance.test.ts
```

## Boundary

The fixture uses existing SINT execution and ROS 2 boundaries:

- `engine://system2/plan` for rollout staging
- `engine://system2/execute` for learned-policy execution
- `/joint_commands` mapping to `ros2:///joint_commands` for hardware actuation

The policy shape is intentionally conservative:

- rollout planning is `T1_prepare`
- learned execution is `T2_act`
- human-workspace actuation escalates to `T3_commit`
- checkpoint swaps after approval are denied as `CONSTRAINT_VIOLATION`

## Receipt Shape

The receipt binds:

- attempted action
- execution or ROS 2 resource
- decision
- assigned tier
- robot identity
- checkpoint reference
- dataset lineage reference
- rollout reference
- hardware profile reference
- workspace
- decision digest
- hash-chain pointers
- timestamp

The design goal is boring traceability. A reviewer should be able to inspect
one receipt and answer: which learned checkpoint produced which hardware-facing
action, on which robot profile, and what policy decision allowed, denied, or
escalated it?
