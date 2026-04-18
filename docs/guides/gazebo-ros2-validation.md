# Gazebo + ROS2 Validation Guide

This guide provides a reproducible simulation path for validating SINT ROS2 bridge behavior before deploying to physical robots.

## Scope

The Gazebo validation profile focuses on control-path safety invariants:

- Gazebo model-scoped topics (for example `/world/demo/model/warehouse_bot/cmd_vel`) are normalized to canonical SINT ROS2 resources.
- Tier assignment remains equivalent to native ROS2 control topics.
- Constraint enforcement (for example max velocity) remains deterministic.

## Run the Validation Stack

```bash
pnpm run stack:gazebo-validation
```

This starts:

- SINT gateway (`http://localhost:3100`)
- PostgreSQL + Redis
- Gazebo simulator container (`gazebo-sim`)
- ROS2 publisher container sending `/model/warehouse_bot/cmd_vel`

Compose profile:

- `docker/compose/gazebo-validation.yml`

## Verify Protocol Behavior

1. Confirm gateway health:

```bash
curl http://localhost:3100/v1/health
```

2. Use dashboard policy playground (`/v1/intercept`) or `sintctl` to replay a Gazebo-scoped request with resource:

```text
ros2:///cmd_vel
```

3. Confirm expected result:

- Assigned tier: `T2_act` (or `T3_commit` with escalation factors)
- Action: `escalate` (or `deny` when constraints are violated)

## Automated Conformance Evidence

Run:

```bash
pnpm --filter @sint/conformance-tests test -- src/industrial-interoperability.test.ts
```

The test `Gazebo model-scoped cmd_vel maps to equivalent ROS2 control-tier semantics` verifies equivalence between canonical ROS2 and Gazebo-scoped control paths.

## Notes

- This profile is for pre-production safety validation and integration testing.
- For production control loops, use dedicated hardware-in-the-loop and safety-controller checks.
- See also: `docs/guides/ros2-lifecycle-guard-demo.md` for a minimal runnable enforcement-context demo that calls `POST /v1/intercept` before a ROS 2 action executes.
