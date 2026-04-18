# @pshkv/bridge-mqtt

SINT Protocol MQTT bridge providing QoS-to-tier mapping for IoT device governance.

## Overview

Maps MQTT Quality of Service (QoS) levels to SINT approval tiers, enabling graduated risk management for IoT communications. Completes **Phase 2** of the Physical AI Governance Roadmap.

## QoS → Tier Mapping

| MQTT QoS | Delivery Guarantee | SINT Tier | AI Behavior |
|---|---|---|---|
| **QoS 0** | At most once (fire-and-forget) | **T0_OBSERVE** | Observation only, no action |
| **QoS 1** | At least once (possible duplicates) | **T1_SUGGEST** | Suggest action, requires confirmation |
| **QoS 2** | Exactly once (guaranteed delivery) | **T2_ACT** | Act immediately, logged for review |

## Usage

### Basic QoS Mapping

```typescript
import { mapQoSToTier, mapTierToQoS } from "@pshkv/bridge-mqtt";
import { ApprovalTier } from "@pshkv/core";

// Sensor reading (QoS 0 = best effort)
const sensorTier = mapQoSToTier(0);
// Returns: ApprovalTier.T0_OBSERVE

// Actuator command (QoS 2 = exactly once)
const actuatorTier = mapQoSToTier(2);
// Returns: ApprovalTier.T2_ACT

// Reverse mapping (tier → QoS)
const qos = mapTierToQoS(ApprovalTier.T3_COMMIT);
// Returns: 2 (use exactly-once for critical actions)
```

### Topic-Based Tier Overrides

```typescript
import { matchTopicToTier, type MQTTTopicRule } from "@pshkv/bridge-mqtt";

const rules: MQTTTopicRule[] = [
  {
    pattern: "home/+/lock/#",
    tier: ApprovalTier.T2_ACT,
    rationale: "Physical security devices require immediate action",
  },
  {
    pattern: "sensors/#",
    tier: ApprovalTier.T0_OBSERVE,
    rationale: "Sensor data is observation-only",
  },
];

// Match topic to determine tier
const tier = matchTopicToTier("home/bedroom/lock/unlock", rules, 1);
// Returns: ApprovalTier.T2_ACT (matches first rule)
```

### MQTT Message Envelopes

```typescript
import { createMQTTMessage, DEFAULT_SMART_HOME_RULES } from "@pshkv/bridge-mqtt";

const message = createMQTTMessage(
  "home/living-room/thermostat/set",
  JSON.stringify({ temperature: 72 }),
  2, // QoS 2
  DEFAULT_SMART_HOME_RULES
);

console.log(message.tier); // ApprovalTier.T1_SUGGEST (matches thermostat rule)
console.log(message.timestamp); // Current timestamp
```

## Topic Pattern Matching

Supports MQTT wildcards:
- `+` matches single topic level
- `#` matches all remaining levels

**Examples:**
- `home/+/lock/#` matches `home/bedroom/lock/unlock`, `home/garage/lock/status`
- `sensors/#` matches `sensors/temperature`, `sensors/motion/living-room`

## Default Smart Home Rules

Pre-configured rules for common smart home scenarios:

```typescript
import { DEFAULT_SMART_HOME_RULES } from "@pshkv/bridge-mqtt";

// Included rules:
// - home/+/lock/# → T2_ACT (physical security)
// - home/+/alarm/# → T2_ACT (security alarms)
// - home/+/camera/# → T0_OBSERVE (EU AI Act compliant)
// - home/+/thermostat/# → T1_SUGGEST (HVAC control)
// - home/+/light/# → T1_SUGGEST (lighting)
// - sensors/# → T0_OBSERVE (all sensors)
// - home/+/appliance/+/on → T2_ACT (safety critical)
```

## Integration with Policy Gateway

```typescript
import { PolicyGateway } from "@pshkv/policy-gateway";
import { createMQTTMessage } from "@pshkv/bridge-mqtt";

const gateway = new PolicyGateway(config);

// MQTT message arrives
const mqttMsg = createMQTTMessage(
  "home/bedroom/lock/unlock",
  Buffer.from("unlock"),
  2, // QoS 2
  DEFAULT_SMART_HOME_RULES
);

// Route through gateway based on determined tier
const decision = await gateway.authorize({
  resource: mqttMsg.topic,
  action: "publish",
  tier: mqttMsg.tier,
  metadata: {
    qos: mqttMsg.qos,
    timestamp: mqttMsg.timestamp,
  },
});

if (decision.approved) {
  // Publish MQTT message
  mqttClient.publish(mqttMsg.topic, mqttMsg.payload, { qos: mqttMsg.qos });
}
```

## Compliance

### Industrial IoT Standards
- **MQTT v5.0** QoS specification compliance
- Maps delivery guarantees to risk tiers

### EU AI Act
- **Article 14**: Human oversight via tiered approval
- Camera feeds default to T0_OBSERVE (no biometric tracking)

### NIST AI RMF
- **Measure function**: QoS as risk indicator
- Higher QoS = higher delivery guarantee = higher tier

## Phase 2 Completion

This bridge completes **Phase 2: Matter + Human-Aware Computing** of the Physical AI Governance Roadmap:

✅ bridge-homeassistant (Phase 2.1)  
✅ Δ_human plugin (Phase 2.2)  
✅ bridge-matter (Phase 2.3)  
✅ **bridge-mqtt** (Phase 2.4) ← **THIS PACKAGE**

**Phase 2 Status:** 100% complete (4/4 deliverables)

## Installation

```bash
npm install @pshkv/bridge-mqtt
```

## License

Apache-2.0

---

**Part of the SINT Protocol Physical AI Governance initiative.**
