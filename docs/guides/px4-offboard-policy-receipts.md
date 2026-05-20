# PX4 Offboard Policy Receipts

This guide is a small collaboration artifact for PX4 maintainers and drone
integrators.

It asks one narrow question: where should arming, OFFBOARD mode, geofence
changes, and continuous MAVLink setpoints pick up auditable policy receipts?

## Fixture

The fixture is:

```text
packages/conformance-tests/fixtures/physical-ai/px4-offboard-policy-receipts.v1.json
```

It covers:

- arming through the MAVLink command boundary
- switching into OFFBOARD mode
- continuous velocity setpoints through MAVLink
- escalating setpoints when a human is near the takeoff zone
- rejecting fence-disable evidence when corridor authorization is missing

## Run The Check

```bash
pnpm --filter @pshkv/conformance-tests exec vitest run src/px4-offboard-policy-receipts-conformance.test.ts
```

## Boundary

The fixture uses existing MAVLink resource mapping helpers:

- `MAV_CMD_COMPONENT_ARM_DISARM` maps to `mavlink://<systemId>/cmd/arm`
- `MAV_CMD_DO_SET_MODE` maps to `mavlink://<systemId>/cmd/mode`
- `SET_POSITION_TARGET_LOCAL_NED` maps to `mavlink://<systemId>/cmd_vel`
- `MAV_CMD_DO_FENCE_ENABLE` maps to `mavlink://<systemId>/cmd/fence`

The policy shape is intentionally conservative:

- arming and OFFBOARD transitions are `T3_commit`
- continuous setpoints are `T2_act`
- human presence near the pad escalates setpoints to `T3_commit`
- missing corridor evidence denies fence-change receipts

## Receipt Shape

The receipt binds:

- attempted action
- MAVLink resource
- decision
- assigned tier
- vehicle and system identity
- target flight mode
- mission reference
- corridor reference
- takeoff zone
- decision digest
- hash-chain pointers
- timestamp

The design goal is boring traceability. A reviewer should be able to inspect
one receipt and answer: which drone action was attempted, under which corridor
and mode assumptions, and what policy decision allowed, denied, or escalated it?
