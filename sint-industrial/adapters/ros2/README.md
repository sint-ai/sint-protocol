# ROS 2 Adapter Profile

Status: active profile.

Policy resource:

```text
ros2:///joint_commands
```

The ROS 2 profile maps `RobotActionProfile` into a
`sint_msgs/msg/FactoryRobotAction`-shaped command envelope while preserving
force, velocity, simulation receipt, approval, and receipt-chain evidence.

Implementation references:

- `packages/bridge-ros2/src/factory-action-profile.ts`
- `packages/bridge-ros2/src/ros2-resource-mapper.ts`
