# @pshkv/bridge-matter

**SINT Bridge for Matter Protocol** — Governance layer for AI agent access to Matter-certified smart home devices.

## Overview

`@pshkv/bridge-matter` provides tier-based authorization for [Matter](https://csa-iot.org/all-solutions/matter/) (formerly CHIP) device interactions. Every AI agent command to Matter devices—from turning on lights to unlocking doors—flows through SINT's Policy Gateway with graduated approval tiers and tamper-evident audit logging.

This is the **Phase 2** deliverable from the [Physical AI Governance Roadmap 2026-2029](../../docs/roadmaps/PHYSICAL_AI_GOVERNANCE_2026-2029.md), completing consumer smart home support alongside `bridge-homeassistant`.

## Why Matter + SINT?

**Matter is the future of smart home interoperability** (backed by Apple, Google, Amazon, Samsung). But Matter has **no built-in AI governance layer**:
- ✅ Matter: Device interoperability (OnOff, DoorLock, Thermostat clusters)
- ❌ Matter: AI agent authorization, graduated approval, audit logging
- ✅ SINT: Fills the governance gap

**SINT + Matter = Cross-vendor AI governance:**
- Same capability token works across Apple Home, Google Home, Amazon Alexa (all support Matter)
- User switches ecosystems → SINT governance layer moves with them
- No vendor lock-in to AI authorization infrastructure

## Features

### ✅ Matter Cluster Mapping

Maps 17 Matter clusters to SINT tiers:

| Matter Cluster | ID | Default Tier | Physical Actuator | Safety Topics |
|---|---|---|---|---|
| **DoorLock** | 0x0101 | **T2_ACT** | ✅ | lock-jammed, tamper-detected |
| **WindowCovering** | 0x0102 | T1_PREPARE | ✅ | obstruction-detected |
| **Thermostat** | 0x0201 | T1_PREPARE | ✅ | extreme-temperature |
| **RobotVacuumCleaner** | 0x0060 | T1_PREPARE | ✅ | cliff-detected, stuck |
| **EnergyEVSE** | 0x0099 | **T2_ACT** | ✅ | charging-fault, overcurrent |
| OnOff | 0x0006 | T1_PREPARE | ❌ | — |
| LevelControl | 0x0008 | T1_PREPARE | ❌ | — |
| ColorControl | 0x0300 | T1_PREPARE | ❌ | — |
| FanControl | 0x0202 | T1_PREPARE | ✅ | — |
| MediaPlayback | 0x0506 | T1_PREPARE | ❌ | — |
| TemperatureMeasurement | 0x0402 | T0_OBSERVE | ❌ | — |
| OccupancySensing | 0x0406 | T0_OBSERVE | ❌ | — |

**Physical Actuators** (escalate with Δ_human):
- DoorLock, WindowCovering, Thermostat, FanControl
- RobotVacuumCleaner, Laundry, Dishwasher
- EnergyEVSE (EV charging)

### ✅ Command-Specific Tier Overrides

Some commands within a cluster require higher tiers:

```typescript
// DoorLock cluster default: T2_ACT
"DoorLock.LockDoor" → T2_ACT
"DoorLock.UnlockDoor" → T2_ACT
"DoorLock.UnlockWithTimeout" → T2_ACT

// EnergyEVSE cluster default: T2_ACT
"EnergyEVSE.EnableCharging" → T2_ACT (financial consequence)
"EnergyEVSE.DisableCharging" → T2_ACT
```

### ✅ Integration with Δ_human Plugin

Matter bridge automatically integrates with Phase 2 Δ_human plugin:

```typescript
// Robot vacuum in empty room
resource: 'matter://fabric-01/node/123/ep/1/RobotVacuumCleaner/commands/Start'
baseTier: T1_PREPARE
Δ_human: 0.0 (no humans detected)
→ Decision: ALLOW (auto-approved)

// Robot vacuum with child present
resource: 'matter://fabric-01/node/123/ep/1/RobotVacuumCleaner/commands/Start'
baseTier: T1_PREPARE
Δ_human: 1.0 (child detected via HA motion sensor)
escalatedTier: T2_ACT
→ Decision: ESCALATE (human approval required)
```

## Installation

```bash
pnpm add @pshkv/bridge-matter
```

**Note:** This package requires Matter controller integration (e.g., [@matter/main](https://www.npmjs.com/package/@matter/main)) for production use. Phase 2 implementation provides the SINT governance layer; Matter.js controller integration is in progress.

## Usage

### Basic Interceptor Setup

```typescript
import { MatterInterceptor, MatterClusterId } from "@pshkv/bridge-matter";
import { createPolicyGateway } from "@pshkv/gate-policy-gateway";

const policyGateway = createPolicyGateway({
  deployment: "home-safe",
  evidenceLedger: true,
});

const interceptor = new MatterInterceptor({
  policyGateway,
  agentDid: "did:key:z6Mk...", // AI agent DID
  fabricId: "fabric-home-01",
  debug: true,
});

// Intercept a DoorLock unlock command
const result = await interceptor.intercept({
  fabricId: "fabric-home-01",
  nodeId: "node-123",
  endpointId: 1,
  clusterId: MatterClusterId.DoorLock,
  commandOrAttribute: "UnlockDoor",
  commandType: "invoke",
});

if (!result.success) {
  console.error("Operation denied:", result.error);
  // e.g., "Human approval required (T2_ACT): Action requires explicit authorization"
}
```

### Creating Pre-Authorized Tokens

```typescript
import { createMatterCapabilityToken, MatterClusterId } from "@pshkv/bridge-matter";

// Pre-authorize "lights on/off" for 30 days
const lightsToken = createMatterCapabilityToken(
  "did:key:z6Mk...", // agent DID
  "fabric-home-01",
  "node-456", // Matter node ID (light bulb)
  1,          // endpoint ID
  MatterClusterId.OnOff,
  "Toggle",
  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
);

await policyGateway.issueToken(lightsToken);
```

### Querying Cluster Information

```typescript
import {
  getClusterName,
  isPhysicalActuatorCluster,
  getSafetyTopics,
  MatterClusterId,
} from "@pshkv/bridge-matter";

const clusterName = getClusterName(MatterClusterId.DoorLock);
console.log(clusterName); // "DoorLock"

const isPhysical = isPhysicalActuatorCluster(MatterClusterId.DoorLock);
console.log(isPhysical); // true

const safetyTopics = getSafetyTopics(MatterClusterId.DoorLock);
console.log(safetyTopics); // ["lock-jammed", "tamper-detected", "battery-low"]
```

## Matter Resource URI Format

SINT uses a hierarchical URI structure for Matter resources:

```
matter://<fabric-id>/node/<node-id>/ep/<endpoint-id>/<ClusterName>/<type>/<command>
```

**Examples:**
- `matter://fabric-home-01/node/123/ep/1/DoorLock/commands/UnlockDoor`
- `matter://fabric-home-01/node/456/ep/1/OnOff/commands/Toggle`
- `matter://fabric-home-01/node/789/ep/1/Thermostat/attributes/LocalTemperature`

**Components:**
- `fabric-id`: Matter fabric (network) identifier
- `node-id`: Device identifier within fabric
- `endpoint-id`: Endpoint on device (devices may have multiple endpoints)
- `ClusterName`: Matter cluster name (DoorLock, OnOff, Thermostat, etc.)
- `type`: `commands` or `attributes`
- `command`: Command or attribute name

## Tier Model

| Tier | Name | Meaning | Matter Examples |
|---|---|---|---|
| **T0** | OBSERVE | Read-only, no actuation | Temperature sensors, occupancy sensors |
| **T1** | PREPARE | Logged, auto-allow | Lights, media, window coverings |
| **T2** | ACT | Requires approval or pre-authorized | Door locks, EV charging, garage doors |
| **T3** | COMMIT | Irreversible, mandatory approval | (Future: binding/unbinding devices) |

## Compliance

| Framework | Requirement | Implementation |
|---|---|---|
| **EU AI Act** | Article 14: Human oversight | T2/T3 approval queues for door locks, EV charging |
| **GDPR** | Article 5: Data minimization | Sensors T0 read-only; no persistent monitoring |
| **NIST AI RMF** | Measure: Track risks | Evidence Ledger with Matter cluster metadata |
| **Matter Spec** | Device attestation | Compatible with Matter's certificate-based commissioning |

## Roadmap

This package implements **Phase 2** of the Physical AI Governance Roadmap:

- ✅ **Matter cluster mapping** (this release)
- ✅ **Tier-appropriate defaults** (this release)
- ✅ **Δ_human integration hooks** (this release)
- 🚧 **Matter.js controller integration** (Phase 2.2)
- 🚧 **Thread mesh support** (Phase 3: Edge/Nano)

## Related Packages

- `@pshkv/gate-policy-gateway` — Core authorization engine
- `@pshkv/gate-capability-tokens` — Cryptographic access tokens
- `@pshkv/evidence-ledger` — Tamper-evident audit log
- `@pshkv/bridge-homeassistant` — Home Assistant governance (complements Matter)
- `@pshkv/policy-gateway/plugins/delta-human` — Human-aware tier escalation

## Why Not Just Use Matter Access Control?

Matter has built-in access control (ACLs), but it's designed for **device-to-device** authorization, not **AI-agent-to-device**:

| Feature | **SINT + Matter** | Matter ACLs Only |
|---|---|---|
| Per-action authorization | ✅ Capability tokens | ❌ Binary allow/deny |
| Graduated approval tiers | ✅ T0–T3 | ❌ |
| Human-aware escalation | ✅ Δ_human plugin | ❌ |
| Tamper-evident audit | ✅ SHA-256 hash chain | ❌ |
| Cross-ecosystem | ✅ Works with any Matter controller | ⚠️ Controller-specific |
| AI agent identity | ✅ Ed25519 DID | ❌ |

**SINT is the missing AI governance layer for Matter.**

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development setup.

## License

Apache-2.0 — see [LICENSE](LICENSE)
