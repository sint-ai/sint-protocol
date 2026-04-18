# @pshkv/bridge-homeassistant

**SINT Bridge for Home Assistant** — Governance layer for AI agent access to consumer smart home devices.

## Overview

`@pshkv/bridge-homeassistant` intercepts [Home Assistant MCP Server](https://www.home-assistant.io/integrations/mcp_server/) tool calls and routes them through SINT's Policy Gateway for tier-based authorization. Every AI agent action on smart home devices—from turning on lights to unlocking doors—flows through graduated approval tiers with tamper-evident audit logging.

This is the first consumer smart home bridge in the SINT Protocol ecosystem, implementing **Phase 1** of the [Physical AI Governance Roadmap 2026-2029](../../docs/roadmaps/PHYSICAL_AI_GOVERNANCE_2026-2029.md).

## Architecture

```
Claude Desktop (or any MCP client)
        ↓
   MCP Protocol
        ↓
HAInterceptor (this package)
        ↓
  Policy Gateway ──→ Evidence Ledger (SHA-256 hash-chained audit)
        ↓
  Allow / Deny / Escalate (T2/T3 human approval)
        ↓
Home Assistant MCP Server
        ↓
   Home Assistant
        ↓
Smart Home Devices (locks, lights, cameras, thermostats, etc.)
```

## Features

### ✅ Consumer Device Profiles

12 device classes with tier-appropriate defaults:

| Device Class | HA Domain | Default Tier | Human-Aware |
|---|---|---|---|
| Smart Lock | `lock` | **T2_ACT** | ❌ |
| Security Camera | `camera` | T0_OBSERVE | ❌ |
| Robot Vacuum | `vacuum` | T1_PREPARE | ✅ (escalates to T2 if humans present) |
| Smart Thermostat | `climate` | T1_PREPARE | ❌ |
| Garage Door | `cover` | **T2_ACT** | ❌ |
| Alarm Panel | `alarm_control_panel` | **T2_ACT** | ❌ |
| Automation | `automation` | **T3_COMMIT** | ❌ |
| Light | `light` | T1_PREPARE | ❌ |
| Switch | `switch` | T1_PREPARE | ❌ |
| Media Player | `media_player` | T1_PREPARE | ❌ |
| Climate | `climate` | T1_PREPARE | ❌ |
| Energy Meter | `sensor` | T0_OBSERVE | ❌ |

### ✅ Safety Topic Monitoring

- `lock-jammed`, `tamper-detected` → triggers CSML escalation
- `cliff-detected`, `stuck` → robot vacuum safety events
- `obstruction-detected` → garage door safety
- `triggered`, `arming` → alarm panel state changes

### ✅ Civil Liberties Guardrails

- **No facial recognition** — security cameras explicitly T0 read-only, no person identification services exposed (EU AI Act Article 5 compliance)
- **Tier-appropriate defaults** — high-consequence devices (locks, alarms, garage doors) require T2 approval
- **Human-aware escalation** — robot vacuums escalate to T2 when humans detected in room (Phase 2 Δ_human plugin)
- **Tamper-evident audit** — all decisions logged in Evidence Ledger with SHA-256 hash chain

## Installation

```bash
pnpm add @pshkv/bridge-homeassistant
```

## Usage

### Basic Interceptor Setup

```typescript
import { HAInterceptor } from "@pshkv/bridge-homeassistant";
import { createPolicyGateway } from "@pshkv/gate-policy-gateway";

const policyGateway = createPolicyGateway(/* config */);

const interceptor = new HAInterceptor({
  policyGateway,
  agentDid: "did:key:z6Mk...", // AI agent DID
  homeAssistantHost: "homeassistant.local",
  debug: true, // Enable verbose logging
});

// Intercept an MCP tool call from Claude
const result = await interceptor.intercept({
  toolName: "call_service",
  toolInput: {
    domain: "lock",
    service: "unlock",
    entity_id: "lock.front_door",
  },
});

if (!result.success) {
  console.error("Service call denied:", result.error);
  // e.g., "Human approval required (T2_ACT): Action requires explicit authorization"
}
```

### Creating Pre-Authorized Tokens

```typescript
import { createHACapabilityToken } from "@pshkv/bridge-homeassistant";

// Pre-authorize "lights on" for 30 days
const token = createHACapabilityToken(
  "did:key:z6Mk...", // agent DID
  "light.living_room",
  "turn_on",
  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // expires in 30 days
);

await policyGateway.issueToken(token);
```

### Querying Device Profiles

```typescript
import { getProfileForDomain, getTierForService } from "@pshkv/bridge-homeassistant";

const lockProfile = getProfileForDomain("lock");
console.log(lockProfile.defaultTier); // ApprovalTier.T2_ACT

const tier = getTierForService("lock", "unlock");
console.log(tier); // ApprovalTier.T2_ACT
```

## Tier Model

| Tier | Name | Meaning | Examples |
|---|---|---|---|
| **T0** | OBSERVE | Read-only, no actuation | Camera snapshots, sensor reads |
| **T1** | PREPARE | Logged, auto-allow | Lights, media players, climate (daytime) |
| **T2** | ACT | Requires approval or pre-authorized context | Locks, garage doors, alarms, climate (nighttime) |
| **T3** | COMMIT | Irreversible, mandatory approval | Create/enable automations |

## Roadmap Phases

This package implements:
- ✅ **Phase 1 (Q2-Q3 2026)**: Consumer device profiles, HA MCP interceptor, safety topic monitoring
- 🚧 **Phase 2 (Q3-Q4 2026)**: Δ_human occupancy plugin (escalate robot vacuum to T2 when humans present), time-window constraints
- 📋 **Phase 3 (2027)**: SceneToken (atomic multi-device authorization)

## Compliance

| Framework | Requirement | Implementation |
|---|---|---|
| **EU AI Act** | Article 5: No biometric ID in public | No facial recognition services; cameras T0 read-only |
| **EU AI Act** | Article 14: Human oversight | T2/T3 approval queues |
| **GDPR** | Article 5: Data minimization | T0 read-only for sensors; no persistent monitoring |
| **NIST AI RMF** | Govern: Assign roles | Capability tokens map to roles |
| **NIST AI RMF** | Measure: Track risks | Evidence Ledger (hash-chained audit) |

## Related Packages

- `@pshkv/gate-policy-gateway` — Core authorization engine
- `@pshkv/gate-capability-tokens` — Cryptographic access tokens
- `@pshkv/evidence-ledger` — Tamper-evident audit log
- `@pshkv/bridge-mcp` — Generic MCP interceptor (this builds on it)
- `@pshkv/bridge-matter` — Matter protocol bridge (Phase 2)

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development setup.

## License

Apache-2.0 — see [LICENSE](LICENSE)
