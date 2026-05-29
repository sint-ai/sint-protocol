# Inspection Cell Example

Status: planned.

Target scenario:

- AI agent proposes a vision inspection cell
- SINT compiles the request into `FactoryIntent` and `CellGraph`
- simulator produces a `SimulationReceipt`
- operator approves the T2/T3 action
- ROS 2, OPC UA, and MQTT adapters carry governed execution and telemetry

Required adapters:

- ROS 2
- OPC UA
- MQTT

Required simulator:

- Isaac Sim
