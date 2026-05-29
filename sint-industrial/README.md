# SINT Industrial Pack

This directory is the Sprint 3 packaging surface for factory-control work.

The pack is intentionally an adapter contract, not a live robot-control claim.
It collects the schemas, policies, execution-path profiles, simulator profiles,
and example-cell targets that make SINT useful between AI-generated industrial
plans and real-world execution systems.

The machine-readable index is [`manifest.v1.json`](./manifest.v1.json).

## Control Boundary

Every industrial execution path in this pack keeps the same boundary:

```text
Factory intent
  -> cell graph
  -> simulation receipt
  -> PolicyGateway.intercept()
  -> human approval or quorum
  -> adapter translation
  -> execution receipt
  -> EvidenceLedger
```

Adapters translate between SINT control objects and vendor or protocol
surfaces. They do not authorize actions themselves.

## Current Status

This is a preview pack for collaborators. The shipped active profiles are:

- ROS 2 factory action envelope
- SRCI command-profile mapping
- OPC UA industrial-control profile
- MQTT industrial telemetry/command profile
- Isaac Sim receipt profile
- RoboDK receipt profile
- RobotStudio receipt profile
- FANUC ROBOGUIDE receipt profile
- KUKA.Sim receipt profile
- KUKA KRL export stub
- Universal Robots URScript export stub
- FactorySettlement attribution profile
- pick-place example cell target

The remaining vendor-specific paths are listed as planned surfaces so external
contributors can see where to plug in without changing the governance model.
