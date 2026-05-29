# Industrial Simulator Contract

Simulator integrations produce `SimulationReceipt` evidence. They do not approve
real-world execution.

Every simulator profile must record:

- simulator identity
- cell ID
- vendor program hash or action digest
- collision status
- safety-zone violations
- force or velocity envelope where available
- decision digest linking the receipt to the policy decision

The receipt becomes one input to `PolicyGateway.intercept()`. Human approval and
the receipt chain are still required for T2/T3 execution.

Active stub profiles now cover Isaac Sim, RoboDK, RobotStudio, FANUC ROBOGUIDE,
and KUKA.Sim. Each one uses the same `SimulationReceipt` evidence contract and
claims no live-control authority.
