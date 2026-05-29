# KUKA.Sim Simulator Profile

Status: active receipt stub.

This profile should turn KUKA.Sim validation output into a `SimulationReceipt`
for KRL artifacts.

The current repo ships the first typed stub in
`packages/bridge-ros2/src/industrial-adapter-profiles.ts`:
`robotActionProfileToKukaSimSimulationReceiptStub()`.

First receipt fields:

- KRL artifact hash
- collision-free result
- cycle time
- safe-operation envelope
- decision digest

Live-control claim:

- none
