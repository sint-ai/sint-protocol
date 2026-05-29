# ABB RobotStudio Simulator Profile

Status: active receipt stub.

This profile turns RobotStudio validation output into the SINT
`SimulationReceipt` shape for ABB RAPID artifacts. It is a receipt contract,
not a claim that a RobotStudio station has been run against a real robot.

Current receipt fields:

- RAPID artifact hash
- collision-free result
- cycle time
- safety-zone violations
- decision digest
- policy resource
- simulator profile ID

Live-control claim:

- none
