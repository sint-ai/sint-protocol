# ABB RAPID Adapter Profile

Status: active export stub.

This profile maps `RobotActionProfile` into a deterministic RAPID export shape
for ABB RobotStudio validation. It is an artifact-generation profile, not a live
controller integration.

Required evidence:

- simulation receipt
- human approval
- factory receipt chain
- vendor program hash

Next implementation step:

- replace the current deterministic stub with a RobotStudio validation harness
  that signs a `SimulationReceipt` for the generated RAPID artifact.
