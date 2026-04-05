# NVIDIA Isaac Sim Integration Guide

This guide defines the SINT validation path for NVIDIA Isaac Sim industrial simulation workflows.

## Scope

The Isaac Sim integration validates that ROS2 namespaced control topics preserve safety semantics when routed through SINT:

- `/isaac/<robot>/cmd_vel` and `/robots/<robot>/joint_commands` map to canonical ROS2 control resources.
- Tiering/approval behavior matches native ROS2 control paths.
- Constraint and revocation behavior remains fail-closed.

## Run Isaac Sim Validation Stack

```bash
pnpm run stack:isaac-sim-validation
```

Compose profile:

- `docker/compose/isaac-sim-validation.yml`

## Environment Notes

- By default, compose expects `nvcr.io/nvidia/isaac-sim:4.2.0`.
- Override image if your org uses a pinned internal mirror:

```bash
export ISAAC_SIM_IMAGE=<your-registry>/isaac-sim:<tag>
```

- NVIDIA NGC credentials may be required to pull Isaac Sim images.

## Validation Checks

1. Gateway health:

```bash
curl http://localhost:3100/v1/health
```

2. Replay/submit an Isaac namespaced resource through SINT as canonical ROS2 control action:

```text
ros2:///cmd_vel
```

3. Expect control-path behavior:

- Assigned tier `T2_act` (or `T3_commit` with escalation factors)
- Action `escalate` unless denied by constraints/policy

## Conformance Evidence

Run:

```bash
pnpm --filter @sint/conformance-tests test -- src/industrial-interoperability.test.ts
```

The test `Isaac Sim namespaced cmd_vel maps to equivalent ROS2 control-tier semantics` verifies equivalence with native ROS2 control behavior.
