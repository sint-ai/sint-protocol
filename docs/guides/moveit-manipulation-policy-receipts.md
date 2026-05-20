# MoveIt Manipulation Policy Receipts

This guide is a small collaboration artifact for MoveIt maintainers and robot
manipulation integrators.

It asks one narrow question: should manipulation execution carry a policy
receipt near the ROS 2 execution boundary, or should that contract live above
MoveIt in an application task executive or below it near the hardware
controller?

## Fixture

The fixture is:

```text
packages/conformance-tests/fixtures/physical-ai/moveit-manipulation-policy-receipts.v1.json
```

It covers:

- staging a manipulation plan
- executing a trajectory through the joint command boundary
- executing a trajectory action goal
- escalating when a human is in the workspace
- rejecting execution evidence when the plan receipt is missing

## Run The Check

```bash
pnpm --filter @pshkv/conformance-tests exec vitest run src/moveit-manipulation-policy-receipts-conformance.test.ts
```

## Boundary

The fixture uses existing ROS 2 resource mapping helpers:

- `/plan` maps to `ros2:///plan`
- `/joint_commands` maps to `ros2:///joint_commands`
- `/execute_trajectory` maps to `ros2:///execute_trajectory`

The policy shape is intentionally conservative:

- planning is `T1_prepare`
- physical execution is `T2_act`
- human-workspace execution escalates to `T3_commit`
- missing plan receipt denies execution evidence

## Receipt Shape

The receipt binds:

- attempted action
- ROS 2 resource
- decision
- assigned tier
- robot
- planning group
- workspace
- end effector
- plan reference
- trajectory reference
- constraint digest
- decision digest
- hash-chain pointers
- timestamp

The design goal is boring traceability. A reviewer should be able to inspect
one receipt and answer: which plan became which physical trajectory, under what
constraints, and what policy decision allowed, denied, or escalated it?
