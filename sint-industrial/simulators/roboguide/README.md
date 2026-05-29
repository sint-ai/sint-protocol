# FANUC ROBOGUIDE Simulator Profile

Status: active receipt stub.

This profile should turn ROBOGUIDE validation output into a `SimulationReceipt`
for FANUC LS or TP artifacts.

The current repo ships the first typed stub in
`packages/bridge-ros2/src/industrial-adapter-profiles.ts`:
`robotActionProfileToRoboGuideSimulationReceiptStub()`.

First receipt fields:

- LS or TP artifact hash
- collision-free result
- cycle time
- safety-zone violations
- decision digest

Live-control claim:

- none
