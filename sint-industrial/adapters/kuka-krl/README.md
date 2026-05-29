# KUKA KRL Adapter Profile

Status: active export stub.

This profile will map `RobotActionProfile` into KRL export artifacts and KUKA.Sim
validation receipts.

Required evidence:

- simulation receipt
- human approval
- factory receipt chain
- vendor program hash

Current implementation:

- deterministic KRL export for pick-and-place actions
- generated program hash for receipt correlation
- non-operational `HALT` boundary until a real adapter backend is attached

Next implementation target:

- KUKA.Sim receipt stub with collision, cycle-time, and safe-operation fields

Live-control claim:

- none
