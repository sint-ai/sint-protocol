# FANUC LS Adapter Profile

Status: active export stub.

This profile maps `RobotActionProfile` into a deterministic FANUC LS export
shape for ROBOGUIDE-style validation. It is an offline-programming artifact
profile, not a live FANUC controller integration.

Required evidence:

- simulation receipt
- human approval
- factory receipt chain
- vendor program hash

Next implementation step:

- add a ROBOGUIDE validation harness that records collision, cycle-time, and
  program-hash outputs into `SimulationReceipt`.
