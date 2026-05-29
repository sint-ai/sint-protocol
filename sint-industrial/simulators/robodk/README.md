# RoboDK Simulator Profile

Status: active receipt stub.

This profile turns RoboDK offline-programming output into the SINT
`SimulationReceipt` shape. It is a receipt contract, not a claim that a RoboDK
station has been run against a real robot.

Current receipt fields:

- vendor program hash
- collision-free result
- cycle time
- generated post-processor target
- decision digest
- policy resource
- simulator profile ID

Live-control claim:

- none
