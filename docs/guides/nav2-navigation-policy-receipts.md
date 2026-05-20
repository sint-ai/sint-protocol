# Nav2 Navigation Policy Receipts

This guide is a small collaboration artifact for Nav2 maintainers and mobile
robot integrators.

It asks one narrow question: where should navigation goals, route staging,
docking motion, and human-workspace escalation pick up auditable policy
receipts?

## Fixture

The fixture is:

```text
packages/conformance-tests/fixtures/physical-ai/nav2-navigation-policy-receipts.v1.json
```

It covers:

- routing a `NavigateToPose` action goal through the gateway boundary
- staging a route as waypoints before motion
- treating docking motion as a high-consequence action
- escalating motion when a human is in the workspace
- rejecting docking motion when zone-access evidence is missing

## Run The Check

```bash
pnpm --filter @pshkv/conformance-tests exec vitest run src/nav2-navigation-policy-receipts-conformance.test.ts
```

## Boundary

The fixture uses existing ROS 2 resource mapping helpers:

- `/navigate_to_pose` maps to `ros2:///navigate_to_pose`
- `/waypoints` maps to `ros2:///waypoints`
- `/cmd_vel` maps to `ros2:///cmd_vel`

The policy shape is intentionally conservative:

- route staging is `T1_prepare`
- docking and movement commands are `T2_act`
- human-workspace motion escalates to `T3_commit`
- missing zone-access receipt denies motion evidence

## Receipt Shape

The receipt binds:

- attempted action
- ROS 2 resource
- decision
- assigned tier
- robot
- route reference
- workspace
- docking target
- zone-access reference
- decision digest
- hash-chain pointers
- timestamp

The design goal is boring traceability. A reviewer should be able to inspect
one receipt and answer: which navigation intent turned into which physical
movement, under which access evidence, and what policy decision allowed,
denied, or escalated it?
