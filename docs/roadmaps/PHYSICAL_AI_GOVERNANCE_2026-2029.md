# SINT Protocol: Physical AI Governance Roadmap 2026–2029
## From Smart Homes to Autonomous Cities — Agents, Robots, and IoT as Governed Citizens

**Document Version:** 1.0.0  
**Status:** Active Development Roadmap  
**Author:** SINT Labs (PSHKV Inc.)  
**Last Updated:** 2026-04-18

---

## Executive Summary

The convergence of agentic AI, embodied robotics, and ubiquitous IoT is creating a governance vacuum. The EU AI Act began enforcement February 2025, the Council of Europe Framework Convention on AI opened for signature September 2024, and NIST's Generative AI Profile (AI 600-1) shipped July 2024 — yet **no open protocol bridges the gap between these frameworks and the physical world where AI agents actuate devices, robots operate among humans, and city sensors collect intimate data**.

SINT Protocol v0.2 already provides the foundational governance layer: a Policy Gateway enforcing capability-based permissions, Ed25519 signed tokens, four-tier graduated approval (T0–T3), and SHA-256 hash-chained tamper-evident audit logging. Eleven bridge adapters span ROS 2, MAVLink, MCP, MQTT Sparkplug, OPC UA, and Open-RMF. The **critical gap** is coverage: no consumer smart home bridges (Matter, Home Assistant), no health/biometric governance, no smart city sensor fabric, no multimodal human-robot interaction primitives.

This roadmap closes that gap with **seven execution phases** spanning Q2 2026 through 2029, positioning SINT as the universal authorization and audit spine for physical AI across three converging domains:

1. **Smart Homes**: domestic robots operating among children and elderly, governed via Matter 1.3, Thread mesh, and Home Assistant MCP
2. **Health & Wellbeing**: ambient health sensing (radar vitals, wearables, bathroom sensors) with FHIR-grade consent primitives and on-device differential privacy
3. **Smart Cities**: municipal sensor meshes (FIWARE/NGSI-LD), delivery robots, acoustic event detection — with citizen-consent layers and public audit trails

**The North Star:** Every capability token issued to unlock a smart lock today is architecturally identical to the token that will govern a domestic robot tomorrow. The home is the deployment surface; the city is the scale target; the regulatory crosswalk (EU AI Act Articles 5 & 14, ISO 13482, NIST AI RMF) is the competitive moat.

---

## Part I: Strategic Context

### 1.1 The Legal Scaffolding Hardened in 2024–2025

**EU AI Act (Regulation 2024/1689):**
- Entered force: 1 August 2024
- Article 5 prohibitions (social scoring, emotion recognition in workplaces/schools, real-time biometric ID in public): **enforced 2 February 2025**
- Article 14 human oversight for high-risk systems: **applicable 2 August 2026**
- Penalties: €35M or 7% global turnover for prohibited practices
- SINT Alignment: Policy Gateway's T2/T3 approval queues map directly to Article 14 oversight requirements; capability tokens enforce Article 5 biometric prohibitions

**Council of Europe Framework Convention on AI:**
- Opened for signature: 5 September 2024 (Vilnius)
- First legally binding international AI treaty (46 CoE states + 11 observers including US, UK, Israel, Japan)
- Requires graduated measures across AI lifecycle protecting human rights, democracy, rule of law
- SINT Alignment: Graduated tier model (T0–T3) implements "proportionate measures based on severity of potential impact"

**NIST AI Risk Management Framework + GenAI Profile (AI 600-1):**
- Published: 26 July 2024
- Govern-Map-Measure-Manage loop with 12 GenAI-specific risks
- SINT Alignment: Evidence Ledger provides Measure function; CSML (Contextual Safety Modifier Language) provides Map function

### 1.2 The Empirical Case for Urgent Action

**Smart Home Tech-Facilitated Abuse (2024 Oxford Academic + Sage):**
- Four abuse vectors documented: surveillance, location tracking, reputational manipulation, smart-home weaponization
- Thermostats remotely switched off, door codes rotated daily, doorbells rung incessantly by absent abuser
- **Structural failure:** abuser owns/configures devices; victim has no audit access or independent revocation
- SINT Solution: Duress tokens, split control primitives, survivor-only cryptographic evidence escrow

**ROS 2 Security Collapse (ACM CCS 2022):**
- Four critical SROS 2 vulnerabilities formally verified (Deng et al.)
- Robots refuse permission revocation, keeping topic access after operator believes it's closed
- November 2025: Supply-chain attack via trojaned `sros2` Debian package exfiltrates PKI keystores
- SINT Solution: Real-time token revocation with cryptographic proof; offline verification for T0/T1

**ShotSpotter Chicago Decommissioning (2024):**
- $49M spent 2018–2024, 136 sq mi coverage (predominantly Black/Latino South & West sides)
- **88.7% false positive rate** (MacArthur Justice Center) — only 9.1% of alerts produced gun-crime evidence
- $714,737 cost per serious gun-crime arrest
- Decommissioned 22 September 2024 after Adam Toledo killing (13-year-old shot responding to alert)
- SINT Lesson: Pre-procurement algorithmic impact assessment mandatory; vendor accuracy claims require independent audit

**MCP Security Breaches (2024–2025, Astrix + AuthZed analysis):**
- 88% of 5,200 MCP servers require credentials; 53% use static secrets; only 8.5% implement OAuth
- CVE-2025-6514: command injection via `authorization_endpoint` (437K+ downloads affected)
- Asana pulled MCP integration after cross-customer data leakage
- SINT Solution: MCP bridge with per-tool-call Policy Gateway intercept, scoped tokens, audit logging

### 1.3 What SINT Already Has (v0.2 Foundation)

**Operational Capabilities:**
- **Policy Gateway:** Single authorization choke point, <3ms p99 latency
- **Four-Tier Model:** T0 OBSERVE (read-only) → T1 PREPARE (logged, auto-allow) → T2 ACT (human approval or pre-authorized context) → T3 COMMIT (irreversible, mandatory approval)
- **Capability Tokens:** Ed25519 signed, scoped to resources/actions, physical constraints encoded (maxVelocityMps, geofence, force limits)
- **Evidence Ledger:** SHA-256 hash-chained append-only audit log, pluggable attestation (ProofReceipt)
- **11 Bridge Adapters:** ROS 2, MAVLink, MCP, MQTT Sparkplug, OPC UA, GRPC, Open-RMF, A2A, Economy, Swarm, IoT (generic MQTT/CoAP)
- **CSML (Contextual Safety Modifier Language):** Behavioral drift detection via acceptance rate (AR), completion rate (CR), safety topic frequency

**Regulatory Alignment Already Implemented:**
- IEC 62443 FR1–FR7 (industrial cybersecurity)
- EU AI Act Article 13 (transparency, record-keeping)
- NIST AI RMF Govern/Measure functions
- ISO 10218 (industrial robots) body-force model

---

## Part II: The Upgrade Path — Seven Execution Phases

### Phase 1: Consumer Smart Home Core (Q2–Q3 2026)
**Strategic Goal:** Establish SINT as the de facto governance layer for AI-controlled smart homes before Amazon, Google, or Apple lock in proprietary solutions.

**Deliverables:**

#### 1.1 `@sint/bridge-homeassistant` (MCP Interceptor Proxy)
**Package:** `packages/bridge-homeassistant/`  
**Description:** Intercepts every MCP tool call from AI agent to Home Assistant MCP Server, routes through Policy Gateway, enforces tier-based approval.

**Technical Spec:**
- Sits between Claude Desktop (or any MCP client) and HA's official MCP Server integration
- Maps HA entity domains to default tiers:
  - `light.*`, `media_player.*`, `switch.*` → T1_PREPARE (logged, auto-allow)
  - `lock.*`, `alarm_control_panel.*` → T2_ACT (approval required or Δ_human pre-authorized)
  - `climate.*` with time constraints → T1 normally, T2 if time ∉ [06:00, 23:00]
  - `automation.create`, `scene.create` → T3_COMMIT (persistent home behavior change)
- Entity → SINT URI: `light.living_room` → `ha://homeassistant.local/entity/light.living_room`
- Deployment: HA add-on wrapping the official MCP Server with SINT governance
- **Civil Liberties Guardrail:** No persistent monitoring; gate decisions logged but entity states not continuously recorded

**Dependencies:** `@sint/bridge-mcp`, `@sint/policy-gateway`, Home Assistant 2024.11+ with MCP Server integration enabled

**Success Metrics:** 
- HA MCP tool calls routed through SINT: 100%
- T2 approval latency: <500ms (human in loop)
- Zero lock/alarm commands executed without explicit approval or pre-authorized occupancy context

#### 1.2 Consumer Device Profiles
**File:** `packages/bridge-iot/src/device-profiles.ts` (extend existing)  
**Description:** Add six consumer device classes to existing industrial profiles (PLC, smart-meter, actuator).

**New Profiles:**
```typescript
export const CONSUMER_DEVICE_PROFILES: Record<string, IoTDeviceProfile> = {
  'smart-lock': {
    type: 'smart-lock',
    defaultTier: TierLevel.T2_ACT,
    safetyTopics: ['lock-jammed', 'tamper-detected', 'battery-critical'],
    tierOverrides: {
      // All lock commands require T2
      'lock': TierLevel.T2_ACT,
      'unlock': TierLevel.T2_ACT,
    },
  },
  'security-camera': {
    type: 'security-camera',
    defaultTier: TierLevel.T0_OBSERVE,
    safetyTopics: [],
    tierOverrides: {
      'stream.start': TierLevel.T0_OBSERVE, // read-only
      'ptz.move': TierLevel.T1_PREPARE,     // pan-tilt-zoom logged
      'recording.start': TierLevel.T1_PREPARE,
    },
  },
  'robot-vacuum': {
    type: 'robot-vacuum',
    defaultTier: TierLevel.T1_PREPARE,
    safetyTopics: ['cliff-detected', 'stuck', 'bin-full'],
    tierOverrides: {
      // Escalates to T2 if Δ_human (person detected in room via HA motion/person entity)
      'start-cleaning': TierLevel.T1_PREPARE, // becomes T2 via Δ_human plugin
    },
  },
  'smart-thermostat': {
    type: 'smart-thermostat',
    defaultTier: TierLevel.T1_PREPARE,
    safetyTopics: [],
    tierOverrides: {
      'set-temperature': TierLevel.T1_PREPARE,
      'set-mode': TierLevel.T1_PREPARE,
    },
  },
  'garage-door': {
    type: 'garage-door',
    defaultTier: TierLevel.T2_ACT,
    safetyTopics: ['obstruction-detected'],
    tierOverrides: {
      'open': TierLevel.T2_ACT,  // irreversible until re-commanded
      'close': TierLevel.T2_ACT,
    },
  },
  'energy-meter': {
    type: 'energy-meter',
    defaultTier: TierLevel.T0_OBSERVE,
    safetyTopics: [],
    tierOverrides: {
      'read': TierLevel.T0_OBSERVE,
      'set-tariff': TierLevel.T1_PREPARE,
      'set-schedule': TierLevel.T1_PREPARE,
    },
  },
};
```

**Civil Liberties Guardrail:** No facial-recognition profile; camera profile explicitly T0 read-only for streams, no automated person-identification capability

#### 1.3 `home-safe` Deployment Profile
**File:** `packages/core/src/deployment-profiles.ts` (extend existing)  
**Description:** Named deployment profile with consumer-appropriate tier defaults and time-window constraints.

**Spec:**
```typescript
export const HOME_SAFE_PROFILE: DeploymentProfile = {
  name: 'home-safe',
  description: 'Consumer smart home with family occupancy awareness',
  defaultTiers: {
    notification: TierLevel.T0_OBSERVE,  // real-time alerts expected
    light: TierLevel.T1_PREPARE,
    media: TierLevel.T1_PREPARE,
    climate: TierLevel.T1_PREPARE,       // with time constraint (see below)
    lock: TierLevel.T2_ACT,
    alarm: TierLevel.T2_ACT,
    energyTariff: TierLevel.T2_ACT,      // financial consequence
    automation: TierLevel.T3_COMMIT,     // persistent behavior change
  },
  timeConstraints: {
    // Climate changes outside waking hours require T2 approval
    'climate.*': {
      allowedWindows: ['06:00-23:00'],
      escalateTo: TierLevel.T2_ACT,
    },
  },
  csmlThresholds: {
    θ_base: 0.15,        // more permissive than industrial (0.20)
    θ_swarm: 0.25,
    windowSize: 100,
  },
};
```

#### 1.4 Avatar Layer Push Notifications
**Package:** `packages/avatar/` (extend existing)  
**Description:** Wire T2/T3 approval queue to WebSocket + mobile deeplink, generate natural-language explanations.

**Technical Spec:**
- Existing `packages/avatar/src/avatar-service.ts` already has SSE stream and WebSocket endpoint
- Add `generateApprovalNotification()` function:
  ```typescript
  function generateApprovalNotification(event: PendingApprovalEvent): Notification {
    const explanation = explainEscalation(event); // natural language
    return {
      title: `${event.agentName} requests approval`,
      body: explanation,
      actions: [
        { label: 'Approve', action: 'approve', deeplink: `sint://approve/${event.requestId}` },
        { label: 'Deny', action: 'deny', deeplink: `sint://deny/${event.requestId}` },
      ],
      metadata: {
        requestId: event.requestId,
        tier: event.tier,
        resource: event.resource,
        timestamp: event.timestamp,
      },
    };
  }
  ```
- Example output: *"Your AI assistant requested to unlock the front door at 11:47 PM. A person is detected near the entrance. [Approve] [Deny]"*

**Civil Liberties Guardrail:** Notifications include **why** the action escalated (transparency), not just **what** was requested

---

### Phase 2: Matter Protocol + Human-Aware Escalation (Q3–Q4 2026)

#### 2.1 `@sint/bridge-matter`
**Package:** `packages/bridge-matter/`  
**Description:** Maps Matter 1.3 device clusters to SINT resources using matter.js TypeScript SDK.

**Technical Spec:**
- Matter uses cluster-based data model: every device exposes typed clusters (`OnOff`, `LevelControl`, `DoorLock`, `Thermostat`, etc.)
- URI mapping: `matter://home.local/device/{node-id}/ep/{endpoint}/{Cluster}/commands/{Command}`
  - Example: `matter://home.local/device/node-01/ep/1/DoorLock/commands/UnlockDoor` → T2_ACT
- Priority clusters for Phase 2:
  - `DoorLock` → T2 (all commands)
  - `OnOff`, `LevelControl` → T1 (lights, plugs)
  - `Thermostat` → T1 (setpoint writes), T0 (reads)
  - `RobotVacuumCleaner` (Matter 1.4) → T2 with Δ_human
- Uses `@matter/main` npm package (official CSA TypeScript implementation)
- `MatterInterceptor` class extends `BaseBridge`, wraps `CommissioningController.connect()`

**Regulatory Alignment:** Matter 1.3 roadmap includes EVSE (vehicle chargers), water heaters, robotic vacuums — all high-consequence actuators. SINT bridges per-action authorization into Matter's certificate-based commissioning model.

#### 2.2 Occupancy-Aware Δ_human Plugin
**Package:** `packages/policy-gateway/src/plugins/delta-human.ts`  
**Description:** Reads Home Assistant `person`, `device_tracker`, `binary_sensor.motion` entities; injects `Δ_human` escalation trigger.

**Logic:**
```typescript
async function computeDeltaHuman(context: PolicyContext): Promise<number> {
  const occupancyEntities = await haClient.getStates([
    'person.*',
    'device_tracker.*',
    'binary_sensor.*_motion',
  ]);
  
  const humansPresent = occupancyEntities.filter(e => 
    e.state === 'home' || e.state === 'on'
  ).length;
  
  if (humansPresent > 0 && isPhysicalActuator(context.resource)) {
    return 1.0; // full tier escalation (+1)
  }
  return 0.0;
}
```

**Effect:** 
- Robot vacuum `start-cleaning` in occupied room: T1 → T2 (requires approval)
- Door unlock with family home: already T2, no change
- Climate setpoint with nobody home: stays T1

**Civil Liberties Guardrail:** Reads only **presence state** (boolean), not location tracking, not biometric identification

#### 2.3 MQTT QoS → Tier Mapping
**Package:** `packages/bridge-iot/src/iot-interceptor.ts` (extend)  
**Description:** Formalize the mapping between MQTT QoS levels and SINT tiers; implement auto-tier-from-QoS.

**Mapping:**
```
MQTT QoS 0 (at most once)   → T0_OBSERVE  (fire-and-forget sensor reads)
MQTT QoS 1 (at least once)  → T1_PREPARE  (guaranteed delivery, logged)
MQTT QoS 2 (exactly once)   → T2_ACT      (critical command, gateway check)
```

**Justification:** MQTT's own reliability model encodes consequence. QoS 2 guarantees exactly-once delivery because the message matters — map that to T2 governance.

---

### Phase 3: Edge / Constrained Device Coverage (2027)

#### 3.1 SINT-nano Lightweight Token
**Spec:** 140-byte embedded token for Cortex-M0+, ESP32, nRF52 (Thread-connected devices)

**Format:**
```
32 bytes: subject DID (compressed Ed25519 public key)
32 bytes: issuer DID
 8 bytes: expiry (Unix timestamp)
 4 bytes: resource hash (first 4 bytes of SHA-256(resource URI))
64 bytes: Ed25519 signature
---
140 bytes total
```

**Verification:**
- Offline for T0/T1: device caches 32-byte issuer public key
- Verifies signature locally, checks expiry, matches resource hash
- No network round-trip required
- Only T2+ actions contact central Policy Gateway

**Academic Grounding:** 2022 study on lightweight capability tokens for IoT (Manipal University) demonstrated <2 KB ROM, <512 bytes RAM overhead on constrained devices

#### 3.2 Hierarchical Trust Proxy
**Package:** `packages/policy-gateway/src/edge-proxy.ts`  
**Description:** Local hub acts as T0/T1 arbiter; only T2+ actions propagate to cloud gateway.

**Architecture:**
```
Cloud Policy Gateway (T2/T3 arbiter)
          ↑
          | (only T2+ requests)
          |
Local Edge Proxy (T0/T1 arbiter)
          ↑
          | (all requests)
          |
Edge Devices (sensors, actuators)
```

**Evidence Ledger Replication:** 
- Local proxy maintains tamper-evident log of T0/T1 decisions
- Asynchronously replicates to cloud ledger (eventual consistency)
- T2/T3 decisions recorded **both** locally and in cloud ledger (dual write)

**Use Case:** Factory floor with 10,000 sensors — gateway would bottleneck. Proxy handles T0/T1 at <1ms latency.

#### 3.3 SceneToken (Atomic Multi-Device Authorization)
**Package:** `packages/capability-tokens/src/scene-token.ts`  
**Description:** Inspired by `SwarmCapabilityToken` (Problem 1 in Research Agenda), applied to home automation scenes.

**Problem:** "Good Night" scene: lock doors + lights off + thermostat set + alarm arm. If **any** command requires T2, partial execution (e.g., locks engaged but alarm not set) is dangerous.

**Solution:**
```typescript
interface SceneToken extends SintCapabilityToken {
  sceneConstraints: {
    atomicActions: string[];          // resource URIs that must execute as a unit
    rollbackOnFailure: boolean;       // if any action fails, undo all
    approvalScope: 'any-t2' | 'all';  // escalate if ANY action is T2, or only if ALL are
  };
}
```

**Execution:**
- Policy Gateway evaluates **all** actions in the scene before starting execution
- If `approvalScope: 'any-t2'` and any action requires T2 → entire scene requires T2 approval
- If approved, all actions execute atomically (or rollback if any fails)

---

### Phase 4: Human-Robot Interaction Foundation (Q4 2026 - Q1 2027)

#### 4.1 `@sint/bridge-hri` (Multimodal Intent Parsing)
**Package:** `packages/bridge-hri/`  
**Description:** Parses natural language, gesture, gaze, proxemics, haptic inputs from humans; generates SINT requests with consent capture.

**Inputs:**
- Voice: transcribed via Whisper/on-device ASR
- Gesture: MediaPipe hand tracking → semantic gestures (point, wave, stop)
- Gaze: eye-tracking (future: AR glasses, robot-mounted cameras)
- Proxemics: human-robot distance from LiDAR/depth camera
- Haptic: force-sensitive touch panels on robot

**Consent Primitive:**
```typescript
interface HRIConsentCapture {
  modality: 'voice' | 'gesture' | 'gaze' | 'touch';
  timestamp: Date;
  consentGiven: boolean;
  evidenceHash: string;  // SHA-256 of sensor data (e.g., audio waveform hash)
}
```

**Example Flow:**
1. User says: "Please unlock the front door"
2. ASR → text: "please unlock the front door"
3. Intent parser → resource: `ha://home/lock.front_door`, action: `unlock`
4. HRI bridge calls Policy Gateway with `HRIConsentCapture` in context
5. Consent recorded in Evidence Ledger
6. If T2 required and consent already captured → auto-approve

**Civil Liberties Guardrail:** 
- Voice/video stored only as **hash** (evidence of consent), not raw data
- No biometric identification (voice/face recognition) — intent parsing only
- Consent expires after 60 seconds (user must re-consent for delayed execution)

#### 4.2 SINT Voiceprint (On-Device Speaker Identification)
**Package:** `packages/avatar/src/voiceprint.ts`  
**Description:** Household-scoped speaker identification for authorization (e.g., "only Mom can unlock doors").

**Technical Spec:**
- Uses on-device embeddings (e.g., Resemblyzer, SpeechBrain)
- Enrollment: "SINT, this is [name]" → store embedding vector locally
- Verification: cosine similarity > 0.85 threshold → identity confirmed
- **Crucially:** embeddings stored **on-device only**, never transmitted
- Household scope: 4-6 enrolled voices (family members)

**Authorization Flow:**
```typescript
const voiceEmbedding = await computeEmbedding(audioWaveform);
const identity = await voiceprintDB.match(voiceEmbedding); // local lookup
if (identity && identity.authorizedFor.includes(resource)) {
  context.approver = identity.name; // e.g., "Mom"
  // T2 approval automatically granted if pre-authorized
}
```

**Civil Liberties Guardrail:**
- **Not facial recognition** (no camera-based biometrics)
- **Household scope only** (not city-scale, not cross-device)
- **User-owned keys** (embeddings encrypted with household key, not cloud-synced)
- **Opt-in enrollment** (explicit "train my voice" step required)

#### 4.3 Avatar Layer v2 (Natural-Language Explainability)
**Package:** `packages/avatar/src/explanation.ts`  
**Description:** Generate human-readable explanations for every T2/T3 escalation.

**Example Outputs:**
- *"This action requires approval because a person is detected in the room (occupancy sensor: binary_sensor.kitchen_motion = on)."*
- *"Unlocking the front door at 11:47 PM is outside normal hours (allowed: 06:00–23:00). Approve to proceed."*
- *"This automation will run every day at 3 AM and cannot be easily reversed. Confirming helps prevent accidental changes."*

**Technical Approach:**
- Template-based generation for common escalation reasons
- LLM-generated for complex multi-factor escalations (via Avatar's existing LLM integration)
- Explanations logged in Evidence Ledger alongside the decision

---

### Phase 5: Health & Wellbeing Fabric (Q1–Q2 2027)

#### 5.1 `@sint/bridge-health` (FHIR + HealthKit/Health Connect)
**Package:** `packages/bridge-health/`  
**Description:** Maps FHIR resources and Apple HealthKit / Google Health Connect data types to SINT resources with consent primitives.

**FHIR Mapping:**
```
fhir://server.example.com/Observation/blood-pressure → T0_OBSERVE (read)
fhir://server.example.com/Patient/123 → T0_OBSERVE (read demographics)
fhir://server.example.com/MedicationRequest → T2_ACT (prescribe medication)
```

**HealthKit Mapping:**
```
healthkit://local/HKQuantityTypeIdentifierStepCount → T0_OBSERVE
healthkit://local/HKQuantityTypeIdentifierHeartRate → T0_OBSERVE
healthkit://local/HKCategoryTypeIdentifierSleepAnalysis → T0_OBSERVE
```

**Consent Primitive (FHIR R5 Consent resource):**
```typescript
interface FHIRConsentToken extends SintCapabilityToken {
  fhirConsent: {
    consentId: string;              // reference to FHIR Consent resource
    grantor: string;                // patient DID
    grantee: string;                // agent DID
    scope: string[];                // e.g., ["Observation.read", "MedicationRequest.write"]
    period: { start: Date; end?: Date };
    provision: 'permit' | 'deny';
  };
}
```

**Apple HealthKit Restrictions (enforced in bridge):**
- No cloud upload (HealthKit data stays on-device)
- Per-data-type permissions (step count ≠ heart rate ≠ sleep)
- Write permissions explicitly flagged in UI
- Revocation via iOS Settings (bridge polls for revocation state)

**Civil Liberties Guardrail:**
- **Opt-in only** (no ambient health sensing without explicit enrollment)
- **On-device first** (raw sensor data processed locally, only aggregates transmitted)
- **Tiered data egress:**
  - Tier 0: Stay on-device (e.g., raw heart rate waveform)
  - Tier 1: Aggregates only (e.g., daily average heart rate)
  - Tier 2: Requires caregiver delegation token for egress to third party
- **User-owned keys** (health data encrypted with user's key, not provider's)

#### 5.2 Differential Privacy Ledger
**Package:** `packages/evidence-ledger/src/dp-aggregator.ts`  
**Description:** Aggregate household health signals without raw data exfiltration using differential privacy.

**Use Case:** Public health research wants "how many households in ZIP code 90210 have elevated heart rate variance?" — answer the query without revealing individual household data.

**Technical Spec:**
- Implements Laplace mechanism: `answer + Lap(sensitivity / ε)`
- ε (epsilon) = privacy budget (smaller = more private, noisier answer)
- Per-household contribution bounded (e.g., heart rate ∈ [40, 200] bpm)
- Aggregates computed over Evidence Ledger health events

**Civil Liberties Guardrail:**
- **Aggregate-only egress** (individual household data never leaves device)
- **Privacy budget tracked** (each query consumes ε; when budget exhausted, no more queries)
- **Public audit of query log** (what questions were asked, by whom, with what ε)

#### 5.3 Caregiver Delegation Tokens
**Package:** `packages/capability-tokens/src/caregiver-token.ts`  
**Description:** Time-bounded, scoped, revocable health access for caregivers (family, nurses, doctors).

**Spec:**
```typescript
interface CaregiverDelegationToken extends SintCapabilityToken {
  caregiverConstraints: {
    delegator: string;               // patient DID
    delegate: string;                // caregiver DID
    allowedDataTypes: string[];      // e.g., ["HeartRate", "BloodPressure"]
    allowedActions: string[];        // e.g., ["read", "export-to-ehr"]
    validPeriod: { start: Date; end: Date };
    emergencyOverride: boolean;      // if true, allows T3 actions in emergencies
    revocationProof?: string;        // cryptographic proof of revocation
  };
}
```

**Revocation:**
- Patient can revoke at any time via UI
- Revocation generates cryptographic proof (signed timestamp)
- Caregiver's next access attempt fails with revocation proof in Evidence Ledger

**Civil Liberties Guardrail:**
- **Explicit consent dialog** at delegation time (not buried in settings)
- **Sunset by default** (tokens expire after 30 days unless renewed)
- **Audit trail visible to patient** (what data caregiver accessed, when)

---

### Phase 6: Smart City Fabric (Q2–Q4 2027)

#### 6.1 `@sint/bridge-city` (FIWARE/NGSI-LD + Urban Sensor Mesh)
**Package:** `packages/bridge-city/`  
**Description:** Maps FIWARE Context Broker (NGSI-LD) entities to SINT resources; enforces citizen-consent layer on municipal AI actions.

**FIWARE/NGSI-LD Mapping:**
```
NGSI-LD entity: urn:ngsi-ld:AirQualityObserved:Madrid-28079004-latest
→ SINT resource: ngsi-ld://fiware.madrid.es/AirQualityObserved/Madrid-28079004-latest
→ Default tier: T0_OBSERVE (public data)

NGSI-LD entity: urn:ngsi-ld:WeatherObserved:LoRaWAN-Sensor-42
→ SINT resource: ngsi-ld://fiware.city.gov/WeatherObserved/LoRaWAN-Sensor-42
→ Default tier: T0_OBSERVE

NGSI-LD entity: urn:ngsi-ld:TrafficFlowObserved:Camera-Intersection-5th-Main
→ SINT resource: ngsi-ld://fiware.city.gov/TrafficFlowObserved/Camera-Intersection-5th-Main
→ Default tier: T0_OBSERVE (aggregated vehicle counts, no license plates)
→ If action: adjust-traffic-signal → T2_ACT (affects public safety)
```

**Citizen-Consent Primitive:**
```typescript
interface CitizenConsentToken extends SintCapabilityToken {
  citizenConsent: {
    jurisdiction: string;              // e.g., "City of Los Angeles"
    legalBasis: 'consent' | 'public-interest' | 'legal-obligation';
    dataMinimization: boolean;         // only collect what's necessary
    retentionPeriod: number;           // days (GDPR Article 5)
    citizenAccessUrl: string;          // URL where citizens view what's collected
    auditTrailPublic: boolean;         // Civic Evidence Ledger readable by public
  };
}
```

**Cities Coalition for Digital Rights Alignment:**
- Universal access: public dashboard showing all sensor data
- Privacy/data sovereignty: citizen-consent primitive enforced at protocol level
- Transparency: public Civic Evidence Ledger (see below)
- Participatory democracy: citizen opt-in for experimental AI programs
- Open standards: NGSI-LD is ETSI standard, open-source

#### 6.2 Civic Evidence Ledger (Public Audit Trail)
**Package:** `packages/evidence-ledger/src/civic-ledger.ts`  
**Description:** SHA-256 hash-chained audit log of all municipal AI agent actions, **publicly readable**.

**What Gets Logged (Public):**
- Timestamp
- Agent DID
- Resource URI (anonymized if PII-linked)
- Action
- Tier level
- Approval status (allowed/denied/escalated)
- Legal basis (consent, public interest, legal obligation)

**What Does NOT Get Logged (Privacy):**
- Raw sensor data (e.g., camera frames, audio recordings)
- Individual citizen identifiers (only aggregate counts)
- Police/emergency data (separate secure ledger)

**Civil Liberties Guardrail:**
- **Transparency as default** (unlike corporate smart home, city ledger is public)
- **No facial recognition** (EU AI Act Article 5 prohibition enforced at bridge level)
- **Prohibition on predictive policing** (SINT bridge refuses to route pre-crime inference requests)

#### 6.3 `@sint/bridge-mobility` (Delivery Robots, EV Charging, Traffic)
**Package:** `packages/bridge-mobility/`  
**Description:** Governs autonomous delivery robots (Starship, Serve Robotics), EV charging coordination, traffic signal integration.

**Delivery Robot Mapping:**
```
Resource: robot://starship.delivery/vehicle/SR-00142
Actions:
  - navigate-to-waypoint → T1_PREPARE (logged, auto-allow on sidewalk)
  - cross-street → T2_ACT (requires pedestrian signal confirmation or manual override)
  - enter-building → T2_ACT (requires building authorization token)
  - emergency-stop → T0_OBSERVE (always allowed, triggers estop)
```

**EV Charging Coordination:**
```
Resource: evse://chargepoint.network/station/CP-12345
Actions:
  - reserve-slot → T1_PREPARE
  - start-charging → T1_PREPARE (if reservation valid)
  - dynamic-pricing-accept → T2_ACT (financial consequence)
```

**Traffic Signal Integration:**
```
Resource: traffic://city.gov/signal/intersection-5th-main
Actions:
  - request-green-phase → T2_ACT (public safety impact)
  - emergency-override → T3_COMMIT (ambulance, fire truck only)
```

**Civil Liberties Guardrail:**
- **No location tracking without consent** (delivery robot path logged, but customer location not linked)
- **Public safety veto** (city can emergency-stop any robot via T3 broadcast)

---

### Phase 7: Violence Prevention + Emergency Response (2028)

**WARNING:** This is the most ethically sensitive phase. Every feature must include hard civil-liberties protections.

#### 7.1 `@sint/bridge-safety` (Acoustic Event Detection, On-Device Only)
**Package:** `packages/bridge-safety/`  
**Description:** Acoustic event detection (glass break, aggression classification) — **strictly on-device, user-owned, opt-in**.

**Hard Prohibitions (Enforced at Bridge Level):**
- **No cloud upload of raw audio** (only event labels + confidence scores transmitted)
- **No facial recognition** (acoustic only, no camera integration)
- **No police API integration without warrant** (bridge refuses to forward events to law enforcement without cryptographic warrant proof)
- **Mandatory disclosure** (when safety mode activates, user receives notification)

**Event Types:**
- Glass break (intrusion detection)
- Loud crash (fall detection for elderly)
- Raised voices (aggression classification, NOT speech-to-text)
- Smoke/CO alarm beep pattern

**Tier Mapping:**
```
Event: glass-break-detected → T1_PREPARE (log event, notify user)
Event: fall-detected-elderly → T2_ACT (notify emergency contact, optionally call 911 with user approval)
Event: aggression-detected → T1_PREPARE (log only, no automatic action)
```

**Civil Liberties Guardrail:**
- **Opt-in enrollment** (off by default)
- **Local processing** (all ML models on-device, no cloud inference)
- **User-owned keys** (audio stored encrypted with user key, not provider key)
- **Sunset on inactivity** (if not triggered in 90 days, prompts user to re-confirm opt-in)

#### 7.2 Emergency Escalation Protocol (Tier-Bypass with Justification)
**Package:** `packages/policy-gateway/src/emergency-bypass.ts`  
**Description:** Allow T2/T3 actions to bypass approval in genuine emergencies, but with cryptographic justification and **mandatory post-hoc audit**.

**Trigger Conditions:**
- Smoke/CO alarm active
- Fall detected + no response for 60 seconds
- Panic button pressed (physical button on smart home hub)

**Bypass Logic:**
```typescript
async function emergencyBypass(context: PolicyContext): Promise<boolean> {
  const emergencyActive = await checkEmergencyConditions();
  if (emergencyActive) {
    // Allow T2/T3 action without approval
    // BUT: log emergency justification in Evidence Ledger
    await evidenceLedger.append({
      type: 'emergency-bypass',
      resource: context.resource,
      action: context.action,
      justification: emergencyActive.reason, // e.g., "smoke-alarm-active"
      bypassedTier: context.tier,
      approverOverride: 'EMERGENCY_SYSTEM',
      cryptographicProof: await signJustification(emergencyActive),
    });
    return true; // allow
  }
  return false; // normal approval flow
}
```

**Post-Hoc Audit:**
- Every emergency bypass logged with cryptographic timestamp
- User notified **within 5 minutes** of bypass activation
- Monthly audit report: "3 emergency bypasses last month: [details]"

**Civil Liberties Guardrail:**
- **Transparent logging** (every bypass visible to user)
- **No silent activation** (user always notified, even mid-emergency)
- **Prohibition on mission creep** (emergency bypass ONLY for life-safety, not convenience)

#### 7.3 Domestic Violence Safety Harness (Survivor-Controlled Evidence Escrow)
**Package:** `packages/capability-tokens/src/duress-token.ts`  
**Description:** Scoped evidence capture for coercive control documentation, with **survivor-only cryptographic key**.

**Scenario:** Abuser controls smart home (owns account, configures devices). Victim needs evidence for restraining order but cannot access device logs.

**SINT Solution:**
```typescript
interface DuressToken extends SintCapabilityToken {
  duressConstraints: {
    survivorDID: string;              // victim's DID
    evidenceTypes: string[];          // e.g., ["lock-unlock-events", "thermostat-changes", "camera-access-log"]
    escrowPublicKey: string;          // survivor's public key
    autoEscrowTrigger?: {
      pattern: string;                // e.g., "lock-unlock-after-midnight > 5 times in 7 days"
      action: 'encrypt-and-store';
    };
  };
}
```

**How It Works:**
1. Victim activates duress mode (e.g., via code word to voice assistant, or physical button)
2. SINT starts encrypting relevant device events with victim's public key
3. Encrypted evidence stored in Evidence Ledger, **inaccessible to abuser** (even if abuser owns account)
4. Victim later exports evidence with their private key for legal proceedings

**Split Control:**
- Abuser retains normal device control (to avoid tipping them off)
- Victim gains **read-only cryptographic access** to audit logs via duress token
- If victim leaves (e.g., to shelter), duress token can also grant **emergency override** (e.g., unlock door, disable cameras)

**Civil Liberties Guardrail:**
- **Survivor-only key** (abuser cannot decrypt, cannot delete evidence)
- **No law enforcement auto-forward** (survivor decides if/when to share evidence)
- **Shelter integration** (partnership with DV shelters to provide SINT-enabled "safe phones" with pre-configured duress tokens)

---

## Part III: Architecture Diagrams

### 3.1 The Citizenship Stack
```
┌─────────────────────────────────────────────────────────────┐
│ Constitutional Layer                                         │
│ (Household/City Constitution, EU AI Act, CoE Convention)    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Human Accountability Layer                                   │
│ (T2/T3 Approval Queues, Caregiver Delegation, Citizen Consent)│
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ SINT Policy Gateway (Authorization + Audit)                 │
│ (Capability Tokens, Tier Model, Evidence Ledger)            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Agent Layer (LLM Task Planners, Voice Assistants)           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Bridge Layer (Home Assistant, Matter, ROS 2, FIWARE)        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Physical Layer (Robots, Locks, Sensors, City Infrastructure)│
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Cross-Domain Token Flow (Home → City → Self)
```
1. Morning: Smart Home
   User: "SINT, start coffee maker"
   → HRI Bridge captures voice consent
   → Policy Gateway: resource=ha://home/switch.coffee_maker, action=turn_on, tier=T1
   → Token: SintCapabilityToken{ subject: user_did, resource: "switch.coffee_maker", tier: T1 }
   → Home Assistant MCP Bridge executes
   → Evidence Ledger: { event: "switch.on", timestamp, approver: "user_voice_consent" }

2. Commute: City
   User's autonomous car requests green light priority
   → bridge-mobility: resource=traffic://city.gov/signal/intersection-5th-main, action=request-green, tier=T2
   → Policy Gateway checks CitizenConsentToken (legal basis: public interest)
   → Civic Evidence Ledger (public): { event: "green-priority-granted", vehicle_class: "autonomous", timestamp }

3. Doctor Visit: Health
   Doctor's EHR requests blood pressure from user's HealthKit
   → bridge-health: resource=healthkit://local/BloodPressure, action=read, tier=T0
   → Policy Gateway checks CaregiverDelegationToken (delegator: patient_did, delegate: doctor_did)
   → Token valid → allow
   → Evidence Ledger (patient-owned): { event: "healthkit.read", accessor: doctor_did, timestamp }
```

### 3.3 The Human Primacy Pyramid
```
                    ┌──────────────────────┐
                    │ Household/City       │
                    │ Constitution         │  ← Immutable values (privacy, safety, consent)
                    └──────────────────────┘
                            ↓
                    ┌──────────────────────┐
                    │ Human Approver       │  ← T2/T3 approval queue
                    │ (Family, Citizen)    │     Caregiver delegation
                    └──────────────────────┘     Emergency override
                            ↓
                    ┌──────────────────────┐
                    │ AI Agent             │  ← Tool calls, task plans
                    │ (Claude, GPT, Gemini)│     Subject to SINT governance
                    └──────────────────────┘
                            ↓
                    ┌──────────────────────┐
                    │ Robot / Actuator     │  ← Physical constraints enforced
                    │ (Vacuum, Drone, Lock)│     Real-time sensor feedback
                    └──────────────────────┘
                            ↓
                    ┌──────────────────────┐
                    │ Sensor / Device      │  ← Data minimization
                    │ (Camera, Motion, GPS)│     On-device processing
                    └──────────────────────┘
```

**Key Principle:** Every decision traces back to a **human locus of accountability**. Even in full autonomy, the constitutional values (encoded in deployment profile) are human-authored.

---

## Part IV: Civil Liberties Constitution (Load-Bearing Commitments)

These are **hard protocol commitments**, not aspirational guidelines. Violations are caught at the bridge level and logged as governance failures.

### 4.1 Biometric Prohibitions
**Article 5 EU AI Act Alignment:**
- **No real-time remote biometric identification in public spaces** (SINT bridge-city refuses to route facial recognition requests in public areas)
- **No emotion recognition in workplace/education** (bridge-hri refuses emotion inference outside healthcare contexts)
- **No social scoring** (SINT capability tokens cannot encode "social credit" constraints)

**Technical Enforcement:**
- `bridge-city` checks resource URI: if `camera://public-space/*` + action `facial-recognition` → DENY with EU AI Act Article 5 violation logged
- `bridge-hri` checks context: if emotion inference + location ≠ home → DENY

### 4.2 On-Device Inference as Default
**Mandatory for:**
- Biometric data (voice, face, fingerprint)
- Health data (heart rate, sleep, medical records)
- Emotion/sentiment analysis

**Technical Implementation:**
- bridge-health: HealthKit data **never transmitted in raw form**; only aggregates/derivatives egress
- bridge-hri: Voiceprint embeddings computed and stored on-device; cosine similarity computed locally
- bridge-safety: Acoustic event models run on-device (TensorFlow Lite, ONNX); only event labels transmitted

### 4.3 User-Owned Keys
**Encryption Architecture:**
- Evidence Ledger: user's private key encrypts sensitive event payloads (e.g., health data access, duress token evidence)
- Smart home: household key encrypts voiceprint embeddings, camera footage metadata
- City sensors: aggregation keys (differential privacy) held by city, but individual citizen data encrypted with citizen keys

**Key Rotation:**
- User can rotate keys at any time
- Old evidence remains encrypted under old key (user retains both keys)
- Forward secrecy: compromising today's key doesn't compromise yesterday's data

### 4.4 Mandatory Transparency Logs
**Public Audit (Cities):**
- Civic Evidence Ledger: publicly readable SHA-256 hash chain
- Citizens can verify: "Did my city's AI agent access traffic camera X on date Y?"

**Private Audit (Homes, Health):**
- Household Evidence Ledger: accessible only to household members
- Each member can export their own audit trail (e.g., "show me all times my health data was accessed")

**Prohibited Practices:**
- **No silent data collection** (every sensor activation logged and user-notifiable)
- **No shadow profiles** (no inference about users who haven't explicitly opted in)

### 4.5 Sunset and Revocation
**All tokens expire:**
- Default: 30 days for health/caregiver delegation tokens
- Default: 90 days for home automation tokens
- Default: 7 days for duress tokens (renewable)

**Revocation guarantees:**
- Revoked token generates cryptographic proof (signed by issuer)
- Next access attempt fails with revocation proof in Evidence Ledger
- User can revoke via UI, voice command, or physical button (no complex menu navigation)

### 4.6 Prohibition on Predictive Policing
**Hard ban:**
- SINT bridges refuse to route "predict crime in neighborhood X" requests
- SINT bridges refuse to route "identify high-risk individuals" requests
- Evidence Ledger flags any attempted predictive-policing query as governance violation

**Justification:** Predictive policing has documented racial bias (ShotSpotter 88.7% false positive in Black neighborhoods); EU AI Act Article 5 prohibition aligns with this ban.

### 4.7 Domestic Violence Protections
**Split control architecture:**
- Abuser retains normal device control (status quo)
- Victim gains cryptographic read-access via duress token (invisible to abuser)
- Victim can export evidence **without abuser's permission**

**Shelter integration:**
- Partnership with DV shelters (e.g., National Network to End Domestic Violence)
- Pre-configured "safe phones" with duress tokens + survivor-only keys
- Training materials for advocates

---

## Part V: Competitive Moat

### 5.1 SINT vs. Proprietary Smart Home AI

| Capability | SINT Protocol | Amazon Alexa+ | Google Home + Gemini | Apple Home + Intelligence |
|---|---|---|---|---|
| Per-action authorization | ✅ T0–T3 tiered | ❌ Account-level | ❌ Account-level | ❌ Account-level |
| Cryptographic audit log | ✅ SHA-256 chain | ❌ Mutable logs | ❌ Mutable logs | ⚠️ Local only |
| Human-in-loop for physical | ✅ T2/T3 queue | ❌ | ❌ | ⚠️ Shortcuts only |
| AI agent identity (DID) | ✅ Ed25519 DID | ❌ API key | ❌ API key | ❌ |
| Open protocol | ✅ Apache 2.0 | ❌ Proprietary | ❌ Proprietary | ❌ Proprietary |
| Cross-vendor interop | ✅ 11 bridges | ❌ Alexa only | ❌ Google only | ❌ Apple only |
| Physical constraints | ✅ In token (velocity, force) | ❌ | ❌ | ❌ |
| Robotics support | ✅ ROS 2, MAVLink | ❌ | ❌ | ❌ |

**The Open Protocol Advantage:** Amazon/Google/Apple can each be the best *within their ecosystem*, but SINT is the only **cross-ecosystem governance layer**. A robot built with SINT works with Home Assistant, Matter, Apple Home, and Alexa — not locked to one vendor.

### 5.2 SINT vs. MCP (Anthropic's Model Context Protocol)

| Capability | **SINT Protocol** | MCP Baseline |
|---|---|---|
| Per-tool-call authorization | ✅ Policy Gateway intercept | ❌ Tool-level only |
| Tiered approval | ✅ T0–T3 | ❌ Binary allow/deny |
| Physical constraints | ✅ maxVelocity, geofence, force | ❌ Digital only |
| Audit log | ✅ SHA-256 hash chain | ❌ None |
| Token revocation | ✅ Real-time with proof | ⚠️ OAuth refresh only |
| Multi-agent coordination | ✅ SwarmCoordinator | ❌ |

**SINT as MCP Security Layer:** `@sint/bridge-mcp` wraps MCP tool calls with SINT governance. Claude Desktop → SINT MCP Bridge → Policy Gateway → Home Assistant. MCP handles *communication*, SINT handles *authorization*.

### 5.3 SINT vs. Enterprise IAM (Okta, Auth0)

| Capability | **SINT Protocol** | Okta/Auth0 |
|---|---|---|
| Physical actuation governance | ✅ Designed for robots | ❌ Digital workforce only |
| Fine-grained action scoping | ✅ Resource + action + tier | ⚠️ Role-based |
| Real-time approval | ✅ <500ms T2 queue | ❌ Pre-provisioned roles |
| Hash-chained audit | ✅ SHA-256 tamper-evident | ⚠️ Mutable logs |
| Swarm coordination | ✅ Collective constraints | ❌ |

**Different Domain:** Okta secures *who accesses what application*. SINT secures *what an AI agent can do in the physical world*. Complementary, not competitive.

### 5.4 SINT vs. Smart City Platforms (AWS IoT, Microsoft Azure IoT)

| Capability | **SINT Protocol** | AWS IoT TwinMaker | Azure IoT |
|---|---|---|
| Citizen-consent primitive | ✅ CitizenConsentToken | ❌ | ❌ |
| Public audit trail | ✅ Civic Evidence Ledger | ❌ | ❌ |
| Open standards | ✅ NGSI-LD, FIWARE | ⚠️ AWS-specific | ⚠️ Azure-specific |
| AI governance tiers | ✅ T0–T3 | ❌ | ❌ |
| Cross-domain (home + city) | ✅ Same protocol | ❌ Separate stacks | ❌ Separate stacks |

**The Lock-In Problem:** AWS/Azure provide excellent infrastructure but **proprietary governance**. Moving from AWS to Azure requires rewriting authorization logic. SINT is **infrastructure-agnostic** — the same capability token works on AWS, Azure, GCP, or bare metal.

---

## Part VI: Regulatory Crosswalk (Cross-Jurisdictional Compliance)

### 6.1 EU AI Act

| Requirement | SINT Feature | Compliance Status |
|---|---|---|
| **Article 5: Prohibited Practices** | | |
| No real-time biometric ID in public | bridge-city refuses facial recognition in public URIs | ✅ Enforced at protocol level |
| No emotion recognition in workplace/schools | bridge-hri context-aware denial | ✅ Enforced at protocol level |
| No social scoring | Capability tokens cannot encode social credit | ✅ By design |
| **Article 13: Transparency & Record-Keeping** | | |
| Log-keeping for high-risk systems | Evidence Ledger (SHA-256 chain) | ✅ Tamper-evident logging |
| Human oversight for decisions | T2/T3 approval queues | ✅ Article 14 alignment |
| **Article 14: Human Oversight** | | |
| Stop/interrupt high-risk system | E-stop broadcast (T3 tier) | ✅ Universal across bridges |
| Fully understand capabilities | Capability token encodes constraints | ✅ Transparent token schema |
| Detect/address risks | CSML behavioral drift detection | ✅ Real-time monitoring |
| **Article 50: Transparency Obligations** | | |
| Users informed when interacting with AI | HRI consent capture logs intent source | ✅ Voice/gesture consent logged |

### 6.2 GDPR (EU Data Protection)

| Requirement | SINT Feature | Compliance Status |
|---|---|---|
| **Article 5: Data Minimization** | | |
| Collect only necessary data | Tier model: T0 read-only, no storage by default | ✅ By design |
| **Article 6: Lawful Basis** | | |
| Consent, legal obligation, public interest | CitizenConsentToken.legalBasis field | ✅ Explicit in token |
| **Article 15: Right to Access** | | |
| User can export their data | Evidence Ledger export API (user-scoped) | ✅ Self-service export |
| **Article 17: Right to Erasure** | | |
| User can delete their data | Evidence Ledger deletion (with tombstone) | ⚠️ Append-only ledger caveat* |
| **Article 25: Data Protection by Design** | | |
| Privacy by default | On-device processing, user-owned keys | ✅ Architectural default |

*Caveat: Evidence Ledger is append-only for integrity, but user can request deletion of raw sensor data; ledger retains hash only (tombstone).

### 6.3 NIST AI RMF 1.0 + Generative AI Profile

| Function | SINT Feature | Compliance Status |
|---|---|---|
| **Govern** | | |
| Assign roles & responsibilities | Capability tokens map to roles | ✅ Token-based RBAC |
| AI risk management policy | Deployment profiles (home-safe, industrial-cell) | ✅ Policy as code |
| **Map** | | |
| Identify context | CSML tracks behavioral context | ✅ Real-time mapping |
| Categorize risks | Tier model (T0–T3) encodes risk levels | ✅ Graduated risk |
| **Measure** | | |
| Track & document risks | Evidence Ledger (hash-chained audit) | ✅ Tamper-evident log |
| Test system performance | Conformance tests (packages/conformance-tests) | ✅ Automated testing |
| **Manage** | | |
| Mitigate risk | T2/T3 human oversight | ✅ Graduated approval |
| Incident response | E-stop + emergency bypass protocol | ✅ Universal e-stop |

### 6.4 Council of Europe Framework Convention on AI

| Principle | SINT Feature | Compliance Status |
|---|---|---|
| **Human Rights Protection** | | |
| Respect for privacy | On-device processing, user-owned keys | ✅ Privacy by design |
| Prohibition on discrimination | No social scoring, no predictive policing | ✅ Hard protocol ban |
| **Democracy Protection** | | |
| Transparency | Public Civic Evidence Ledger (cities) | ✅ Transparency by default |
| **Rule of Law** | | |
| Legal basis for data processing | CitizenConsentToken.legalBasis | ✅ Explicit in token |
| Accountability | Tamper-evident audit log | ✅ SHA-256 hash chain |

### 6.5 ISO 13482:2014 (Personal Care Robots)

| Requirement | SINT Feature | Compliance Status |
|---|---|---|
| Risk assessment | CSML + Δ_human escalation | ✅ Real-time risk tracking |
| Safety-related control system | Policy Gateway as safety layer | ✅ No bypass invariant |
| Protective measures | Physical constraints (velocity, force) in token | ✅ Enforced at protocol |
| Information for use | Natural-language explanations (Avatar v2) | ✅ T2/T3 escalation reasons |

### 6.6 HIPAA (US Health Insurance Portability and Accountability Act)

| Requirement | SINT Feature | Compliance Status |
|---|---|---|
| **Administrative Safeguards** | | |
| Access control | CaregiverDelegationToken (scoped, time-bound) | ✅ Fine-grained access |
| Audit controls | Evidence Ledger (patient-owned) | ✅ Tamper-evident log |
| **Physical Safeguards** | | |
| Device & media controls | On-device processing (HealthKit stays local) | ✅ No cloud upload |
| **Technical Safeguards** | | |
| Access control | Ed25519 signed tokens | ✅ Cryptographic auth |
| Encryption | User-owned keys encrypt health data | ✅ E2E encryption |
| Audit logs | Evidence Ledger export for patient | ✅ Self-service access |

---

## Part VII: Implementation Priority Matrix

Each Phase 1–7 deliverable scored on five dimensions (1–5 scale):

| Deliverable | User Value | Tech Complexity | Civil Liberties Weight | Competitive Moat | Regulatory Alignment | **Total** | **Priority** |
|---|---|---|---|---|---|---|---|
| **Phase 1: Consumer Smart Home** | | | | | | | |
| `@sint/bridge-homeassistant` | 5 | 3 | 4 | 5 | 4 | **21** | **1** |
| Consumer device profiles | 4 | 2 | 3 | 4 | 3 | **16** | 4 |
| `home-safe` deployment profile | 4 | 2 | 4 | 3 | 4 | **17** | 3 |
| Avatar push notifications | 5 | 2 | 3 | 4 | 3 | **17** | 3 |
| **Phase 2: Matter + Human-Aware** | | | | | | | |
| `@sint/bridge-matter` | 5 | 4 | 3 | 5 | 4 | **21** | **1** |
| Δ_human occupancy plugin | 4 | 3 | 5 | 4 | 5 | **21** | **1** |
| MQTT QoS → tier mapping | 3 | 2 | 2 | 3 | 3 | **13** | 7 |
| **Phase 3: Edge / Nano** | | | | | | | |
| SINT-nano lightweight token | 3 | 5 | 2 | 4 | 3 | **17** | 3 |
| Hierarchical trust proxy | 3 | 4 | 2 | 3 | 3 | **15** | 5 |
| SceneToken atomic multi-device | 4 | 3 | 3 | 3 | 3 | **16** | 4 |
| **Phase 4: HRI Foundation** | | | | | | | |
| `@sint/bridge-hri` | 4 | 5 | 5 | 5 | 4 | **23** | **HIGH** |
| SINT Voiceprint (on-device) | 4 | 4 | 5 | 4 | 3 | **20** | 2 |
| Avatar v2 explainability | 5 | 3 | 4 | 4 | 4 | **20** | 2 |
| **Phase 5: Health Fabric** | | | | | | | |
| `@sint/bridge-health` | 5 | 4 | 5 | 5 | 5 | **24** | **CRITICAL** |
| Differential privacy ledger | 3 | 5 | 5 | 4 | 4 | **21** | **1** |
| Caregiver delegation tokens | 5 | 3 | 5 | 4 | 5 | **22** | **HIGH** |
| **Phase 6: Smart City** | | | | | | | |
| `@sint/bridge-city` | 4 | 4 | 5 | 5 | 5 | **23** | **HIGH** |
| Civic Evidence Ledger | 4 | 3 | 5 | 5 | 5 | **22** | **HIGH** |
| `@sint/bridge-mobility` | 3 | 3 | 3 | 4 | 4 | **17** | 3 |
| **Phase 7: Safety + Emergency** | | | | | | | |
| `@sint/bridge-safety` | 4 | 4 | 5 | 3 | 4 | **20** | 2 |
| Emergency bypass protocol | 5 | 3 | 5 | 3 | 5 | **21** | **1** |
| Duress token (DV protection) | 5 | 4 | 5 | 4 | 4 | **22** | **HIGH** |

**Priority Rank (Descending):**
1. **CRITICAL (≥24):** `@sint/bridge-health`
2. **HIGH (22–23):** `@sint/bridge-hri`, Caregiver delegation, `@sint/bridge-city`, Civic Evidence Ledger, Duress token
3. **Top Tier 1 (21):** `@sint/bridge-homeassistant`, `@sint/bridge-matter`, Δ_human plugin, Differential privacy ledger, Emergency bypass
4. **Tier 2 (20):** SINT Voiceprint, Avatar v2, `@sint/bridge-safety`
5. **Tier 3 (17–19):** SINT-nano, `home-safe` profile, Avatar push notifications, `@sint/bridge-mobility`
6. **Tier 4 (15–16):** Hierarchical trust proxy, SceneToken, Consumer device profiles
7. **Tier 5 (<15):** MQTT QoS mapping

---

## Part VIII: Execution Timeline (Gantt Chart)

```
2026 Q2  Q3  Q4    2027 Q1  Q2  Q3  Q4    2028 Q1  Q2  Q3  Q4
     │   │   │         │   │   │   │         │   │   │   │
P1   ████████             │   │   │   │         │   │   │   │   Consumer Smart Home Core
     │   │   │         │   │   │   │         │   │   │   │
P2   │   ████████         │   │   │   │         │   │   │   │   Matter + Human-Aware
     │   │   │         │   │   │   │         │   │   │   │
P3   │   │   ████████     │   │   │   │         │   │   │   │   Edge / Nano
     │   │   │         │   │   │   │         │   │   │   │
P4   │   ████████████     │   │   │   │         │   │   │   │   HRI Foundation (parallel with P2/P3)
     │   │   │         │   │   │   │         │   │   │   │
P5   │   │   │         ████████████ │   │         │   │   │   │   Health Fabric
     │   │   │         │   │   │   │         │   │   │   │
P6   │   │   │         │   ████████████         │   │   │   │   Smart City
     │   │   │         │   │   │   │         │   │   │   │
P7   │   │   │         │   │   │   ████████████ │   │   │   Safety + Emergency
     │   │   │         │   │   │   │         │   │   │   │
```

**Key Milestones:**
- **2026 Q2 End:** Phase 1 complete → Home Assistant + Matter bridges operational
- **2026 Q3 End:** Phase 2 complete → Δ_human escalation live in consumer homes
- **2026 Q4 End:** Phase 4 HRI core → Voice consent + explainability shipping
- **2027 Q1 End:** Phase 3 complete → Edge nano tokens deployed on Thread devices
- **2027 Q2 End:** Phase 5 complete → FHIR health bridge + differential privacy
- **2027 Q4 End:** Phase 6 complete → Smart city FIWARE bridge + public audit
- **2028 Q2 End:** Phase 7 complete → Safety harness + duress tokens operational

---

## Part IX: Technical Appendix

### 9.1 SintCapabilityToken v2 Schema (with Physical Constraints + Citizenship Claims)

```typescript
interface SintCapabilityTokenV2 {
  // Core identity
  id: string;                    // Token UUID
  version: '2.0.0';
  issuer: string;                // Issuer DID (e.g., did:key:z6Mk...)
  subject: string;               // Agent DID
  
  // Resource scoping
  resource: string;              // SINT URI (e.g., ha://home/lock.front_door)
  actions: string[];             // Allowed actions (e.g., ["unlock", "lock"])
  tier: TierLevel;               // T0/T1/T2/T3
  
  // Physical constraints (NEW in v2)
  physicalConstraints?: {
    maxVelocityMps?: number;     // meters per second
    maxForceMagnitude?: number;  // newtons
    maxTorque?: number;          // newton-meters
    geofence?: GeoJSON.Polygon;  // spatial boundary
    safeZones?: string[];        // resource URIs (e.g., "home", "office")
    prohibitedZones?: string[];  // e.g., "playground", "hospital"
  };
  
  // Citizenship claims (NEW in v2)
  citizenshipClaims?: {
    jurisdiction: string;         // e.g., "City of Los Angeles"
    legalPersona: 'agent' | 'robot' | 'device';
    accountabilityChain: string[]; // DID chain to human owner
    constitutionalScope?: string; // URI to household/city constitution
  };
  
  // Temporal
  issuedAt: Date;
  expiresAt: Date;
  
  // Approval context
  approvalMetadata?: {
    approver: string;             // DID or "EMERGENCY_SYSTEM"
    approvalMethod: 'voice' | 'gesture' | 'ui-click' | 'pre-authorized';
    consentEvidence?: string;     // SHA-256 hash of consent proof
  };
  
  // Cryptographic proof
  signature: string;              // Ed25519 signature over token payload
}
```

### 9.2 Tier Escalation Function with Δ_human, Δ_proxemics, Δ_vulnerability

```typescript
async function computeTierEscalation(
  baseToken: SintCapabilityTokenV2,
  context: PolicyContext
): Promise<TierLevel> {
  let tier = baseToken.tier;
  
  // Δ_human: human presence detected
  const Δ_human = await computeDeltaHuman(context); // 0.0 or 1.0
  
  // Δ_proxemics: human-robot distance
  const Δ_proxemics = await computeDeltaProxemics(context); // 0.0 to 1.0
  
  // Δ_vulnerability: child or elderly detected
  const Δ_vulnerability = await computeDeltaVulnerability(context); // 0.0 or 1.0
  
  // Escalation logic
  const totalDelta = Δ_human + Δ_proxemics + Δ_vulnerability;
  
  if (totalDelta >= 1.5 && tier < TierLevel.T3_COMMIT) {
    tier = tier + 1; // escalate by one tier
  } else if (totalDelta >= 0.5 && tier < TierLevel.T2_ACT) {
    tier = tier + 1;
  }
  
  return tier;
}

async function computeDeltaProxemics(context: PolicyContext): Promise<number> {
  const distance = await getLidarDistance(context.robotId, context.humanId);
  if (distance < 0.5) return 1.0; // intimate zone (<0.5m)
  if (distance < 1.2) return 0.5; // personal zone (0.5–1.2m)
  return 0.0;                     // social zone (>1.2m)
}

async function computeDeltaVulnerability(context: PolicyContext): Promise<number> {
  const people = await detectPeople(context); // via camera/LiDAR
  const vulnerable = people.filter(p => 
    p.heightCm < 120 || // child
    p.gaitSpeed < 0.8   // elderly/mobility-impaired
  );
  return vulnerable.length > 0 ? 1.0 : 0.0;
}
```

### 9.3 SINT-nano Binary Format (140 bytes)

```
Byte Offset | Length | Field
------------|--------|--------------------------------------
0           | 32     | Subject DID (compressed Ed25519 pubkey)
32          | 32     | Issuer DID (compressed Ed25519 pubkey)
64          | 8      | Expiry (Unix timestamp, uint64 LE)
72          | 4      | Resource hash (first 4 bytes of SHA-256)
76          | 64     | Ed25519 signature
------------|--------|--------------------------------------
Total: 140 bytes

Verification (on-device, no network):
1. Check expiry > now
2. Verify signature using issuer pubkey (cached locally)
3. Hash resource URI, compare first 4 bytes to stored hash
4. If all pass → allow T0/T1 action
5. If T2/T3 → contact gateway (full token required)
```

### 9.4 CSML v2 Grammar Extensions (Multimodal Context)

```typescript
interface CSMLContextV2 extends CSMLContext {
  // Existing fields (from v0.2)
  acceptanceRate: number;        // AR = allowed / total
  completionRate: number;        // CR = completed / started
  safetyTopicFrequency: number;  // safety events / total
  
  // NEW: Multimodal context
  humanProximity?: {
    nearbyHumans: number;         // count
    minDistance: number;          // meters
    vulnerablePresent: boolean;   // child/elderly
  };
  
  // NEW: Behavioral fingerprint
  actionHistogram?: Map<string, number>; // action → frequency
  velocityDistribution?: {
    mean: number;
    stdDev: number;
    p95: number;                  // 95th percentile
  };
  
  // NEW: Model drift tracking
  foundationModelId?: string;     // e.g., "gpt-4o-2024-11-20"
  modelFingerprintHash?: string;  // SHA-256 of model config
}

function computeCsmlScore(context: CSMLContextV2): number {
  // Base CSML (acceptance + completion + safety)
  const baseCsml = 
    (1 - context.acceptanceRate) * 0.4 +
    (1 - context.completionRate) * 0.4 +
    context.safetyTopicFrequency * 0.2;
  
  // Multimodal penalty
  let multimodalPenalty = 0.0;
  if (context.humanProximity) {
    if (context.humanProximity.vulnerablePresent) {
      multimodalPenalty += 0.1;
    }
    if (context.humanProximity.minDistance < 1.0) {
      multimodalPenalty += 0.05;
    }
  }
  
  // Behavioral drift penalty
  let driftPenalty = 0.0;
  if (context.velocityDistribution) {
    const velocitySpread = context.velocityDistribution.p95 - context.velocityDistribution.mean;
    if (velocitySpread > 0.3) { // high variance
      driftPenalty += 0.05;
    }
  }
  
  return Math.min(1.0, baseCsml + multimodalPenalty + driftPenalty);
}
```

### 9.5 Evidence Ledger Entry Types (Extended for Citizenship)

```typescript
type SintLedgerEventType =
  | 'decision'           // Policy Gateway allow/deny/escalate
  | 'escalation'         // Tier escalation (Δ_human, CSML > θ)
  | 'override'           // T2/T3 approval granted
  | 'revocation'         // Token revoked
  | 'emergency-bypass'   // Emergency protocol activated
  | 'consent-capture'    // NEW: HRI consent logged (voice/gesture)
  | 'health-access'      // NEW: Health data accessed (FHIR/HealthKit)
  | 'civic-action'       // NEW: Municipal AI action (traffic, delivery)
  | 'duress-activation'  // NEW: Duress token activated (DV protection)
  | 'model-swap';        // NEW: Foundation model changed

interface SintLedgerEventV2 {
  id: string;
  type: SintLedgerEventType;
  timestamp: Date;
  agentDid: string;
  resource: string;
  action: string;
  tier: TierLevel;
  decision: 'allow' | 'deny' | 'escalate';
  
  // Accountability chain
  approver?: string;              // DID or "EMERGENCY_SYSTEM"
  citizenshipChain?: string[];    // DID chain to human
  
  // Context
  csmlScore?: number;
  deltaHuman?: number;
  deltaProxemics?: number;
  deltaVulnerability?: number;
  
  // Cryptographic proof
  previousHash: string;           // SHA-256(previous event)
  eventHash: string;              // SHA-256(this event)
  signature: string;              // Ed25519 signature
}
```

### 9.6 Citizenship Registry Data Model

```typescript
interface CitizenshipRecord {
  did: string;                    // Agent/robot/device DID
  type: 'agent' | 'robot' | 'device';
  
  // Accountability
  humanOwner: string;             // Human DID (locus of accountability)
  issuer: string;                 // Who issued this citizenship (e.g., city, household)
  jurisdiction: string;           // e.g., "Los Angeles", "Household-42"
  
  // Constitutional scope
  constitutionalDocument: string; // URI to constitution (e.g., IPFS hash)
  
  // Lifecycle
  issuedAt: Date;
  expiresAt?: Date;
  revoked: boolean;
  revocationProof?: string;
  
  // Capabilities
  capabilities: string[];         // Resource URIs this citizen can access
  
  // Audit
  evidenceLedgerId: string;       // Which ledger logs this citizen's actions
}
```

### 9.7 Example Flows

#### Flow 1: Robot Vacuum in Kitchen with Child Present (Δ_vulnerability Escalation)

```
1. User (via voice): "SINT, start the vacuum"
2. HRI bridge captures voice consent:
   - ASR → text: "SINT start the vacuum"
   - Intent: resource=ha://home/vacuum.roomba, action=start_cleaning
   - HRIConsentCapture logged (modality: voice, timestamp, evidenceHash)
3. Policy Gateway receives request:
   - Base token: tier=T1_PREPARE (robot vacuum default)
   - computeTierEscalation():
     - Δ_human = 1.0 (person detected via HA motion sensor)
     - Δ_vulnerability = 1.0 (child detected: height < 120cm via robot camera)
     - totalDelta = 2.0 → escalate T1 → T2
4. T2_ACT tier triggered:
   - Avatar generates notification:
     "Vacuum requested to start cleaning. A child is detected in the kitchen. Approve?"
   - User approves via mobile push notification
5. Policy Gateway allows:
   - Evidence Ledger entry:
     {
       type: 'decision',
       decision: 'allow',
       tier: T2_ACT,
       approver: user_did,
       deltaVulnerability: 1.0,
       consentEvidence: SHA-256(voice_waveform)
     }
6. Home Assistant MCP bridge executes: vacuum.start()
```

#### Flow 2: Elderly Fall Detected → Tiered Caregiver Notification with Consent Escrow

```
1. Acoustic event model (on-device): loud crash detected
2. bridge-safety: 
   - Event: fall-detected-elderly
   - Context: no response for 60 seconds (inferred from silence)
3. Policy Gateway:
   - Resource: safety://home/event/fall-detected
   - Action: notify-emergency-contact
   - Base tier: T2_ACT (emergency contact notification)
4. Check CaregiverDelegationToken:
   - Delegator: elderly_parent_did
   - Delegate: adult_child_did
   - Allowed actions: ["notify", "read-location"]
   - Valid period: still active
5. Token valid → allow notification:
   - SMS sent to adult child: "Fall detected at [address]. Last activity 2 min ago."
   - Evidence Ledger entry:
     {
       type: 'health-access',
       decision: 'allow',
       tier: T2_ACT,
       approver: caregiver_delegation_token,
       consentEvidence: SHA-256(delegation_token_signature)
     }
6. If no response in 5 minutes → escalate to T3:
   - Call 911 with emergency bypass (logged with justification)
```

#### Flow 3: City Delivery Robot Requesting Sidewalk Access → Citizen-Consent Check

```
1. Starship delivery robot: navigate to 123 Main St
2. Route planner: sidewalk segment requires crossing park
3. bridge-mobility:
   - Resource: mobility://city.gov/sidewalk/park-segment-42
   - Action: navigate
   - Base tier: T1_PREPARE (public sidewalk, normally allowed)
4. Policy Gateway checks CitizenConsentToken:
   - Jurisdiction: City of Los Angeles
   - Legal basis: public-interest (delivery service)
   - Data minimization: true (no camera recording, only LiDAR navigation)
   - Retention period: 7 days
5. Civic Evidence Ledger (public):
   - Entry visible to all citizens:
     {
       type: 'civic-action',
       decision: 'allow',
       tier: T1_PREPARE,
       resource: 'mobility://city.gov/sidewalk/park-segment-42',
       legalBasis: 'public-interest',
       timestamp: '2027-06-15T14:32:00Z'
     }
6. Robot proceeds; citizens can audit ledger to see "how many robots crossed park today?"
```

#### Flow 4: Domestic Violence Duress Token Activation → Evidence Capture with Survivor-Only Key

```
1. Victim (whispers to voice assistant): "SINT duress activate"
2. SINT Voiceprint confirms identity: speaker=victim_did
3. Duress token activated:
   - DuressToken:
     - survivorDID: victim_did
     - evidenceTypes: ["lock-unlock-events", "thermostat-changes", "camera-access"]
     - escrowPublicKey: victim_public_key
4. SINT starts encrypting relevant events:
   - Lock unlocked at 11:47 PM → encrypt event with victim_public_key
   - Thermostat set to 55°F at 2:14 AM → encrypt event
   - Camera accessed (remotely) at 3:22 AM → encrypt event
5. Encrypted evidence stored in Evidence Ledger:
   - Abuser sees normal ledger entries (hashes only, no decryption)
   - Victim later exports evidence:
     - Decrypts with private key (held only by victim)
     - Provides to attorney for restraining order
6. Split control maintained:
   - Abuser retains normal device control (no tipping off)
   - Victim gains cryptographic read-access invisible to abuser
```

---

## Part X: Conclusion — From Permission-by-Default to Consent-by-Design

The decisive shift between 2024 and 2026 is not the arrival of AI governance frameworks — it is the **collapse of the assumption that "permissive mode" is compatible with rights-respecting deployment**. ShotSpotter's 88.7% false positive rate, smart-home coercive control, ROS 2 security bypasses, and MCP credential leakage all trace back to the same root: **systems deployed faster than their authorization, consent, and accountability layers**.

SINT Protocol closes that gap by making **consent-by-design** the architectural default. Every action starts denied. Every capability token is scoped, time-bound, and cryptographically signed. Every decision is logged in a tamper-evident hash chain. Every human has a locus of accountability in the citizenship pyramid.

This is not a research vision — **SINT v0.2 already ships this foundation** with 11 operational bridges. The roadmap extends that foundation from industrial robots and research labs into **the three domains where physical AI will touch billions of lives: smart homes, health monitoring, and smart cities**.

The timeline is aggressive because the governance gap is urgent. The civil-liberties guardrails are load-bearing because the deployment surface is intimate. The regulatory crosswalk is comprehensive because the legal scaffolding is hardening globally.

**The North Star holds:** Every capability token issued to unlock a smart lock today is architecturally identical to the token that will govern a domestic robot tomorrow. The home is the deployment surface. The city is the scale target. The open protocol is the moat. The consent primitive is the foundation.

---

**Next Steps (Immediate):**
1. Begin Phase 1 implementation: `@sint/bridge-homeassistant` skeleton
2. Extend `packages/bridge-iot/src/device-profiles.ts` with consumer profiles
3. Draft `home-safe` deployment profile
4. Set up community feedback loop (GitHub Discussions, Discord)
5. Prepare Show HN launch post (targeting June 2026)

**Document Status:** Active Development Roadmap  
**Maintained By:** SINT Labs ([github.com/sint-ai/sint-protocol](https://github.com/sint-ai/sint-protocol))  
**License:** CC BY 4.0 (documentation), Apache 2.0 (code)

---

*For the people building the future where AI agents, robots, and IoT devices are governed citizens — not ungoverned subjects.*
