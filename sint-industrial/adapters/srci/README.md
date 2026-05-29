# SRCI Adapter Profile

Status: active profile.

The SRCI profile maps `RobotActionProfile` into a PLC-facing command profile
without granting execution authority. The command still routes through the
same SINT policy resource and still requires simulation proof, human approval,
and receipt-chain evidence.

Implementation reference:

- `packages/bridge-ros2/src/industrial-adapter-profiles.ts`
