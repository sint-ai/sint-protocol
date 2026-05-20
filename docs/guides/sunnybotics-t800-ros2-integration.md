# Sunnybotics T800 ROS2 Integration

This guide captures the smallest honest SINT integration path we can infer from
Sunnybotics' public T800 repository.

## Public Stack Clues

The public repository at `Sunnybotics/T800-SunnyBOT` points to:

- ROS 2 Foxy on the host side
- micro-ROS on the embedded side
- `rclc` executor usage
- FreeRTOS
- STM32 HAL timers and motor drivers
- a custom `common/msg/Wheels` message
- a namespaced wheel command topic at `/robot/cmd_wheels`
- a namespaced encoder topic at `/robot/enc_wheels`

The important part for SINT is the control boundary:

1. a ROS 2 wheel command is received over micro-ROS
2. the callback forwards those wheel values directly into motor actuation

That is exactly where runtime governance matters.

## Problem

Most generic ROS 2 safety examples assume one of these:

- `geometry_msgs/Twist` on `/cmd_vel`
- manipulator commands on `/joint_commands`

Sunnybotics' public robot surface is different. It uses a custom two-wheel
message for differential-drive actuation. Without first-class support for that
shape, a governance layer either misses the real control boundary or forces a
rewrite that the robot team did not ask for.

## What We Added

We extended `@pshkv/bridge-ros2` so SINT can understand this shape directly:

- namespaced differential-drive topic normalization
- canonical resource mapping for `/robot/cmd_wheels` to `ros2:///cmd_wheels`
- canonical resource mapping for `/robot/enc_wheels` to `ros2:///enc_wheels`
- physical context extraction from custom two-wheel command messages
- conservative velocity estimation from wheel angular speed and wheel radius
- core tiering for `ros2:///cmd_wheels` as `T2_act`

The conservative part matters. The bridge uses the faster wheel as the motion
bound, so turning-in-place still counts as active motion.

## Why This Helps

Based on Sunnybotics' public website, news, and LinkedIn updates, the company is
trying to improve:

- solar asset performance
- cleaning and inspection throughput
- field safety
- context around alarms and performance drops

SINT helps at the exact moment where software intent becomes field motion:

- block wheel commands that exceed site policy
- bind site row, weather, and work-permit context to the capability token
- escalate when a human is in the aisle or work zone
- emit tamper-evident receipts for every allow, deny, and escalation

## Example

```ts
import { ROS2Interceptor } from "@pshkv/bridge-ros2";

const interceptor = new ROS2Interceptor({
  gateway,
  agentId,
  tokenId,
  robotMassKg: 22,
  differentialDriveNormalize: true,
  differentialDriveWheelRadiusM: 0.1,
});

const result = await interceptor.interceptPublish({
  topicName: "/robot/cmd_wheels",
  messageType: "common/msg/Wheels",
  data: {
    header: { frame_id: "field_bot_03" },
    param: [4.2, 4.0],
  },
  timestamp: new Date().toISOString(),
});
```

With normalization enabled, this publish maps to `ros2:///cmd_wheels`, and SINT
can enforce the same velocity and approval controls it already applies to other
physical motion paths.

## Matching Policy Template

Use the solar field profile template as a starting point:

```text
docs/profiles/solar-field-robot.policy.template.json
```

## Best Next Step

If Sunnybotics engages, the best joint artifact is a tiny adapter or fixture
around one real command path:

- one wheel command topic
- one permit or human-presence constraint
- one receipt shape

That keeps the collaboration practical and avoids trying to redesign their whole
robot stack in public.
