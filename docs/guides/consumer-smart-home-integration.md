# Consumer Smart Home Integration Guide

**Integrating SINT governance with Home Assistant for AI-controlled smart homes.**

This guide covers Phase 1-2 of the [Physical AI Governance Roadmap](../roadmaps/PHYSICAL_AI_GOVERNANCE_2026-2029.md): consumer smart home core and human-aware tier escalation.

---

## Quick Start (5 minutes)

### Prerequisites

- Home Assistant 2024.11+ with [MCP Server integration](https://www.home-assistant.io/integrations/mcp_server/) enabled
- SINT Protocol workspace (`pnpm install && pnpm run build`)
- Node.js 22+

### 1. Install Packages

```bash
pnpm add @pshkv/bridge-homeassistant @pshkv/gate-policy-gateway
```

### 2. Create Policy Gateway with Δ_human Plugin

```typescript
import { createPolicyGateway } from "@pshkv/gate-policy-gateway";
import { createDeltaHumanMiddleware } from "@pshkv/gate-policy-gateway/plugins/delta-human";
import { HAInterceptor } from "@pshkv/bridge-homeassistant";

// Initialize Policy Gateway
const policyGateway = createPolicyGateway({
  deployment: "home-safe", // Consumer smart home profile
  evidenceLedger: true,    // Enable tamper-evident audit logging
});

// Add Δ_human occupancy plugin (Phase 2)
const deltaHumanPlugin = createDeltaHumanMiddleware({
  homeAssistantUrl: "http://homeassistant.local:8123",
  accessToken: process.env.HA_LONG_LIVED_TOKEN,
  debug: true, // Enable verbose logging during setup
});
policyGateway.use(deltaHumanPlugin);

// Create HA interceptor
const haInterceptor = new HAInterceptor({
  policyGateway,
  agentDid: "did:key:z6Mk...", // Your AI agent's DID
  homeAssistantHost: "homeassistant.local",
  debug: true,
});
```

### 3. Intercept MCP Tool Calls

```typescript
// Example: AI agent wants to turn on lights
const result = await haInterceptor.intercept({
  toolName: "call_service",
  toolInput: {
    domain: "light",
    service: "turn_on",
    entity_id: "light.living_room",
  },
});

if (result.success) {
  console.log("✅ Action allowed:", result.result);
} else {
  console.error("❌ Action denied:", result.error);
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ Claude Desktop / AI Agent                               │
└─────────────────────────────────────────────────────────┘
                            ↓
                      MCP Protocol
                            ↓
┌─────────────────────────────────────────────────────────┐
│ HAInterceptor (@pshkv/bridge-homeassistant)             │
│ - Maps HA entities → SINT resource URIs                 │
│ - Applies consumer device profiles (locks=T2, lights=T1)│
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│ Policy Gateway                                          │
│ ├─ Δ_human Plugin (Phase 2)                            │
│ │  - Fetches HA occupancy entities                     │
│ │  - Escalates vacuum T1→T2 if person detected         │
│ ├─ Capability Token Verification                       │
│ └─ Tier-Based Decision: Allow / Deny / Escalate        │
└─────────────────────────────────────────────────────────┘
                            ↓
              ┌──────────────────────────┐
              │ Evidence Ledger          │
              │ (SHA-256 hash-chained)   │
              └──────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│ Home Assistant MCP Server                               │
│ - Executes service calls (if approved)                  │
└─────────────────────────────────────────────────────────┘
                            ↓
               Smart Home Devices
```

---

## Consumer Device Profiles

SINT maps Home Assistant entity domains to approval tiers:

| Domain | Device Type | Default Tier | Escalates with Δ_human? |
|---|---|---|---|
| `lock` | Smart Lock | **T2_ACT** | ❌ (always T2) |
| `alarm_control_panel` | Alarm | **T2_ACT** | ❌ |
| `cover` | Garage Door | **T2_ACT** | ❌ |
| `vacuum` | Robot Vacuum | T1_PREPARE | ✅ → T2 if person present |
| `climate` | Thermostat | T1_PREPARE | ❌ |
| `light` | Lights | T1_PREPARE | ❌ |
| `switch` | Power Switch | T1_PREPARE | ❌ |
| `media_player` | Media | T1_PREPARE | ❌ |
| `camera` | Security Camera | T0_OBSERVE | ❌ |
| `sensor` | Energy Meter | T0_OBSERVE | ❌ |
| `automation` | Automation | **T3_COMMIT** | ❌ |

**Tier Meanings:**
- **T0_OBSERVE**: Read-only (camera snapshots, sensor reads)
- **T1_PREPARE**: Logged, auto-allow (lights, media, climate during day)
- **T2_ACT**: Requires approval or pre-authorized context (locks, alarms, garage doors)
- **T3_COMMIT**: Irreversible, mandatory approval (create automation)

---

## Phase 2: Δ_human Escalation

The Δ_human plugin monitors Home Assistant occupancy entities and escalates tier when humans are detected near physical actuators.

### How It Works

1. **Fetch Occupancy State**: Plugin queries HA for `person.*`, `device_tracker.*`, `binary_sensor.*_motion`
2. **Count Humans**: Sum entities indicating presence (`state = 'home'` or `state = 'on'`)
3. **Check Resource Type**: If resource is a physical actuator (vacuum, lock, garage door)
4. **Escalate Tier**: If humans > 0 AND physical actuator → tier += 1

### Example: Robot Vacuum

**Without Δ_human:**
```typescript
// No humans in room
resource: 'ha://home/vacuum.roomba'
action: 'start'
baseTier: T1_PREPARE
→ Decision: ALLOW (auto-approved)
```

**With Δ_human:**
```typescript
// Child detected in kitchen (binary_sensor.kitchen_motion = on)
resource: 'ha://home/vacuum.roomba'
action: 'start'
baseTier: T1_PREPARE
Δ_human: 1.0 (humans present)
escalatedTier: T2_ACT
→ Decision: ESCALATE (human approval required)
→ Avatar notification: "Vacuum requested to start. A person is detected in the kitchen. Approve?"
```

### Occupancy Entity Patterns

Default patterns monitored:
- `person.*` — HA person entities (state: 'home' | 'away')
- `device_tracker.*` — Phones, wearables (state: 'home' | 'away')
- `binary_sensor.*_motion` — Motion sensors (state: 'on' | 'off')
- `binary_sensor.*_occupancy` — Occupancy sensors (state: 'on' | 'off')

Customize via config:
```typescript
const deltaHumanPlugin = createDeltaHumanMiddleware({
  homeAssistantUrl: "http://homeassistant.local:8123",
  accessToken: process.env.HA_LONG_LIVED_TOKEN,
  occupancyEntityPatterns: [
    "person.*",
    "device_tracker.*",
    "binary_sensor.living_room_motion",
    "binary_sensor.kitchen_occupancy",
  ],
});
```

### Physical Actuator Detection

Resources classified as physical actuators (escalate when humans present):
- **Home Assistant**: `lock.*`, `cover.*`, `vacuum.*`, `fan.*`, `climate.*`, `switch.*`
- **ROS 2**: All `ros2://` URIs (robot commands)
- **MAVLink**: All `mavlink://` URIs (drone commands)

Non-physical resources (no escalation):
- **Home Assistant**: `light.*`, `sensor.*`, `binary_sensor.*`, `camera.*`
- **MCP**: All `mcp://` URIs (digital tools)

---

## Pre-Authorizing Common Actions

Create capability tokens to pre-approve routine actions:

```typescript
import { createHACapabilityToken } from "@pshkv/bridge-homeassistant";

// Pre-authorize "lights on" for 30 days
const lightsToken = createHACapabilityToken(
  "did:key:z6Mk...", // agent DID
  "light.living_room",
  "turn_on",
  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // expires in 30 days
);

await policyGateway.issueToken(lightsToken);

// Now agent can turn on living room light without approval
```

### Time-Window Constraints (Phase 1)

Climate changes outside normal hours require T2 approval:

```typescript
// During day (06:00-23:00): T1_PREPARE (auto-allow)
await haInterceptor.intercept({
  toolName: "call_service",
  toolInput: {
    domain: "climate",
    service: "set_temperature",
    entity_id: "climate.living_room",
    temperature: 72,
  },
});
// → ALLOW (T1, daytime)

// At night (23:00-06:00): Escalated to T2_ACT
// Same call at 2 AM:
// → ESCALATE ("Climate changes outside waking hours require approval")
```

---

## Evidence Ledger Integration

Every decision is logged in a tamper-evident SHA-256 hash-chained audit log:

```typescript
// View recent evidence entries
const recentEvents = await policyGateway.evidenceLedger.getRecent(10);

recentEvents.forEach(event => {
  console.log({
    timestamp: event.timestamp,
    resource: event.resource,
    action: event.action,
    tier: event.tier,
    decision: event.decision,
    deltaHuman: event.metadata?.deltaHuman,
    explanation: event.metadata?.deltaHumanExplanation,
    previousHash: event.previousHash,
    eventHash: event.eventHash,
  });
});

// Example output:
// {
//   timestamp: 2026-04-18T14:32:00Z,
//   resource: 'ha://home/vacuum.roomba',
//   action: 'start',
//   tier: 'T2_ACT',
//   decision: 'escalate',
//   deltaHuman: 1.0,
//   explanation: '1 human(s) detected near physical actuator (binary_sensor.kitchen_motion)',
//   previousHash: 'a3f8c9...',
//   eventHash: 'b2d7e1...',
// }
```

---

## Civil Liberties Guardrails

### No Facial Recognition (EU AI Act Article 5)

Security cameras are **strictly read-only** (T0_OBSERVE). No person identification:

```typescript
// ✅ ALLOWED: Camera snapshot
await haInterceptor.intercept({
  toolName: "call_service",
  toolInput: {
    domain: "camera",
    service: "snapshot",
    entity_id: "camera.front_door",
  },
});
// → ALLOW (T0, read-only)

// ❌ DENIED: Person detection service (not exposed in consumer profiles)
// EU AI Act Article 5 prohibition enforced at protocol level
```

### On-Device Occupancy Detection

Δ_human plugin reads **only presence boolean**, not identities:
- ✅ Detects: "A person is in the kitchen" (binary_sensor.kitchen_motion = on)
- ❌ Does NOT detect: "Alice is in the kitchen" (no biometric identification)
- ❌ Does NOT track: Location history, movement patterns, behavior profiling

### Transparent Escalation

Every tier escalation includes **explanation** in audit log:
```json
{
  "deltaHumanExplanation": "1 human(s) detected near physical actuator (binary_sensor.kitchen_motion)",
  "humansDetected": 1,
  "triggeringEntities": ["binary_sensor.kitchen_motion"]
}
```

Users can export their Evidence Ledger to see exactly when and why actions were escalated.

---

## Compliance

| Framework | Requirement | Implementation |
|---|---|---|
| **EU AI Act Article 5** | No real-time biometric ID in public | Cameras T0 read-only; no facial recognition services |
| **EU AI Act Article 14** | Human oversight for high-risk | T2/T3 approval queues |
| **GDPR Article 5** | Data minimization | Only presence boolean, no identity/location tracking |
| **NIST AI RMF Measure** | Track and document risks | Evidence Ledger with Δ_human metadata |
| **ISO 13482** | Personal care robot safety | Human-aware escalation for robot vacuum |

---

## Troubleshooting

### "HA API error: 401 Unauthorized"

**Cause**: Invalid or expired Home Assistant Long-Lived Access Token.

**Fix**: Generate new token in HA:
1. Navigate to: `http://homeassistant.local:8123/profile`
2. Scroll to "Long-Lived Access Tokens"
3. Click "Create Token"
4. Copy token and set `HA_LONG_LIVED_TOKEN` env var

### "Could not extract entity_id from MCP tool call"

**Cause**: MCP tool input doesn't match expected format.

**Fix**: Ensure tool input includes `entity_id` field:
```typescript
{
  domain: "light",
  service: "turn_on",
  entity_id: "light.living_room", // Required
}
```

### Δ_human not detecting occupancy

**Cause**: HA entities not matching default patterns.

**Fix**: Check entity IDs in HA and customize `occupancyEntityPatterns`:
```typescript
const deltaHumanPlugin = createDeltaHumanMiddleware({
  // ...
  occupancyEntityPatterns: [
    "person.*",
    "device_tracker.*",
    "binary_sensor.custom_sensor_name", // Add your custom entities
  ],
  debug: true, // Enable debug logging to see what's detected
});
```

---

## Next Steps

- **Phase 2 (Q3-Q4 2026)**: bridge-matter for Matter 1.3 device support
- **Phase 3 (2027)**: SceneToken for atomic multi-device authorization
- **Phase 4 (Q4 2026 - Q1 2027)**: bridge-hri for multimodal consent (voice, gesture)

---

## Related Documentation

- [Physical AI Governance Roadmap 2026-2029](../roadmaps/PHYSICAL_AI_GOVERNANCE_2026-2029.md)
- [bridge-homeassistant README](../../packages/bridge-homeassistant/README.md)
- [Δ_human Plugin Source](../../packages/policy-gateway/src/plugins/delta-human.ts)
- [Consumer Device Profiles](../../packages/bridge-homeassistant/src/consumer-profiles.ts)

---

**For the people building the future where AI agents operate in our homes with rights-preserving governance.**
