# Universal Robots Adapter Profile

Status: active export stub.

This profile will map `RobotActionProfile` into URScript, PolyScope handoff, ROS
2, or SRCI-mediated Universal Robots execution paths.

Required evidence:

- simulation receipt
- human approval
- factory receipt chain
- vendor program hash

Current implementation:

- deterministic URScript export for bounded pick-and-place actions
- generated program hash for receipt correlation
- non-operational `halt` boundary until a real adapter backend is attached

Next implementation target:

- ROS 2 or SRCI profile link to the existing active SINT profiles

Live-control claim:

- none
