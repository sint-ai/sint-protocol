# MQTT Adapter Profile

Status: active profile.

Policy resource:

```text
mqtt://*/factory/**
```

The MQTT profile covers industrial telemetry, command staging, and
gateway-mediated publish/subscribe paths. It is useful for edge gateways,
sensors, simple actuators, and factory event streams that need the same
evidence discipline as robot commands.

Implementation references:

- `packages/bridge-iot/src/mqtt-session.ts`
- `packages/bridge-iot/src/iot-resource-mapper.ts`
