# Modbus Adapter Profile

Status: planned.

This profile will cover register and coil command governance for Modbus TCP or
RTU gateways.

The first useful version should focus on safe command staging:

- map register and coil writes into `SintRequest` resources
- classify writes that affect actuators as T2 or T3
- require simulation or hardware-safety evidence before physical writes
- emit execution receipts with address, function code, value hash, and gateway ID

Live-control claim:

- none
