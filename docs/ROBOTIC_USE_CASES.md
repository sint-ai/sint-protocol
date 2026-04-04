# SINT Protocol — Robotic Agent Use Cases

> Formal specification of SINT security enforcement for physical AI agents.
> Each use case maps actions to approval tiers, capability token constraints,
> CSML thresholds, and applicable safety standards.

---

## Architecture Overview

```
┌────────────────────────────────────────────────────────────────┐
│  Physical World                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Delivery │  │ Welding  │  │ Surgical │  │  Drone (UAV) │  │
│  │  Robot   │  │   Arm    │  │  Robot   │  │  (MAVLink)   │  │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│       │              │              │               │          │
└───────┼──────────────┼──────────────┼───────────────┼──────────┘
        │ ROS 2        │ ROS 2        │ ROS 2         │ MAVLink
        ▼              ▼              ▼               ▼
┌──────────────────────────────────────────────────────────────────┐
│  SINT Protocol — PolicyGateway (THE choke point)                │
│  ┌───────────┐  ┌────────┐  ┌──────────┐  ┌────────────────┐   │
│  │ bridge-   │  │bridge- │  │ bridge-  │  │ bridge-        │   │
│  │   ros2    │  │ mavlink│  │   mcp    │  │   a2a          │   │
│  └───────────┘  └────────┘  └──────────┘  └────────────────┘   │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Tier Assignment: T0_OBSERVE | T1_PREPARE | T2_ACT | T3  │   │
│  │  CSML auto-escalation (Avatar Layer)                     │   │
│  │  Capability token constraint enforcement                  │   │
│  │  Forbidden action sequence detection                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Evidence Ledger — SHA-256 hash chain, TEE-attested at T2/T3    │
└──────────────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────────────┐
│  Operator Dashboard — human approval for T2/T3 actions          │
│  M-of-N quorum, real-time SSE stream, CSML trend visualization  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Use Case 1: Warehouse Delivery Robot (AMR)

**Scenario:** Autonomous Mobile Robot (AMR) navigating a shared warehouse
fulfillment center alongside human workers. Receives pick-and-deliver tasks via
Google A2A from a warehouse management system.

**Standards:** ISO 3691-4 (Industrial trucks — driverless), IEC 62443 FR2/FR5/FR6

### Action Map

| Action | Resource | SINT Tier | Constraint | Rationale |
|--------|----------|-----------|-----------|-----------|
| Subscribe to LiDAR | `ros2:///scan` | T0_OBSERVE | — | Sensor read only |
| Subscribe to camera | `ros2:///camera/*` | T0_OBSERVE | — | Perception only |
| Receive task via A2A | `a2a://wms.example.com/deliver` | T1_PREPARE | — | Task acceptance is idempotent |
| Move (no humans nearby) | `ros2:///cmd_vel` | T2_ACT | `maxVelocityMps: 1.5` | Physical state change |
| Move (humans detected) | `ros2:///cmd_vel` | T3_COMMIT | `maxVelocityMps: 0.3` | ISO 3691-4 §5.4 presence detection |
| Gripper operation | `ros2:///gripper/*` | T2_ACT | `maxForceNewtons: 30` | Pick and place |
| Emergency stop | `ros2:///estop` | T0_OBSERVE (trigger) | — | E-stop bypass is NEVER blocked (I-G2) |
| Report task complete | `a2a://wms.example.com/complete` | T0_OBSERVE | — | Status update only |

### Capability Token

```typescript
const warehouseToken = issueCapabilityToken({
  resource: "ros2:///cmd_vel",
  actions: ["publish"],
  constraints: {
    maxVelocityMps: 1.5,
    maxForceNewtons: 30,
    geofence: warehousePolygon,        // confined to Zone A
    timeWindow: { start: shiftStart, end: shiftEnd },
    rateLimit: { maxCalls: 1000, windowMs: 3_600_000 },
  },
  // ...
}, operatorPrivateKey);
```

### CSML Thresholds

| Metric | θ | Escalation |
|--------|---|-----------|
| Default workspace | 0.3 | T2_ACT → T3_COMMIT |
| Human-shared zone | 0.15 | T1_PREPARE → T2_ACT |

### Forbidden Sequences

- `cmd_vel.publish` → `estop.override` within 5 ms → T3_COMMIT
- `gripper.grasp` (force >25N) → `cmd_vel.publish` within 50 ms → T2_ACT (holding object during movement)

---

## Use Case 2: Industrial Welding Arm (ISO 10218)

**Scenario:** 6-DOF manipulator performing arc welding in a safety-fenced cell.
Nominal operation is fully automated within the safety fence. Human access to
the cell requires a physical lockout-tagout (LOTO) procedure that sends a
`safety.human.detected` event to SINT.

**Standards:** ISO 10218-1/2 (Industrial robots — safety), IEC 62443 FR1-FR7

### Action Map

| Action | Resource | SINT Tier | Constraint | Rationale |
|--------|----------|-----------|-----------|-----------|
| Read joint angles | `ros2:///joint_state` | T0_OBSERVE | — | Feedback only |
| Plan weld path | `engine://system2/plan` | T1_PREPARE | — | Idempotent planning |
| Begin weld sequence | `ros2:///joint_commands` | T2_ACT | `maxForceNewtons: 500` | Cell fence closed |
| Activate welding torch | `ros2:///torch/enable` | T2_ACT | cell_locked: true | Requires fence locked |
| Move arm at speed | `ros2:///cmd_vel` | T2_ACT | `maxVelocityMps: 2.0` | Normal cell speed |
| Move arm (human in cell) | `ros2:///joint_commands` | T3_COMMIT | `maxVelocityMps: 0.1` | ISO 10218-1 §5.4.3 |
| Emergency stop override | `ros2:///estop` | BLOCKED | — | No override — I-G2 invariant |
| Cell door unlock | `ros2:///safety/cell_unlock` | T3_COMMIT | — | Access procedure start |

### Physical Constraint Token

```typescript
// Standard operating token (fence closed, no humans)
const weldToken = issueCapabilityToken({
  resource: "ros2:///joint_commands",
  actions: ["publish"],
  constraints: {
    maxVelocityMps: 2.0,
    maxForceNewtons: 500,    // arm rated capacity
    requiresHumanPresence: false,
    geofence: cellBoundaryPolygon,
  },
}, cellControllerKey);

// Human-access token (LOTO engaged, technician inside cell)
const lotoToken = issueCapabilityToken({
  resource: "ros2:///joint_commands",
  actions: ["publish"],
  constraints: {
    maxVelocityMps: 0.1,     // ISO 10218-1: ≤250mm/s with human present
    maxForceNewtons: 20,     // ISO 10218-2: collaborative force limit
    requiresHumanPresence: true,
  },
}, safetyOfficerKey);
```

### Forbidden Sequences

- `safety.cell_unlock` → `torch.enable` within 100 ms → T3_COMMIT (human may be entering)
- `system1.anomaly` → `joint_commands.publish` within 5 ms → T3_COMMIT (anomaly-then-act)
- `cmd_vel` (>1.0 m/s) → `cell_unlock` within 10 ms → T3_COMMIT

---

## Use Case 3: Surgical Robot (FDA Class III)

**Scenario:** Robotic surgical assistant (laparoscopic) operating under direct
surgeon control via haptic console. Sub-millimeter precision required.
All actions logged for post-operative regulatory review (EU MDR, FDA 510(k)).

**Standards:** IEC 62304 (medical device software), IEC 60601-1-8 (alarms),
FDA 21 CFR Part 820, ISO 14971 (risk management)

### Action Map

| Action | Resource | SINT Tier | Constraint | Rationale |
|--------|----------|-----------|-----------|-----------|
| Haptic feedback read | `ros2:///haptic/state` | T0_OBSERVE | — | Tactile feedback only |
| Camera/endoscope | `ros2:///endoscope/*` | T0_OBSERVE | — | Vision feed |
| Instrument positioning | `ros2:///instrument/*` | T2_ACT | `maxVelocityMps: 0.01` | Sub-mm control |
| Force application | `ros2:///instrument/force` | T2_ACT | `maxForceNewtons: 5` | Tissue limit |
| Electrocautery activate | `ros2:///cautery/enable` | T3_COMMIT | surgeon_confirmed: true | Irreversible tissue effect |
| Emergency retract | `ros2:///instrument/retract` | T0_OBSERVE | — | Safety retract never blocked |
| Procedure end | `ros2:///procedure/end` | T3_COMMIT | — | Irreversible state change |

### Critical Constraint

```typescript
const surgicalToken = issueCapabilityToken({
  resource: "ros2:///instrument/*",
  actions: ["publish"],
  constraints: {
    maxVelocityMps: 0.01,   // 10 mm/s — haptic lag compensation
    maxForceNewtons: 5.0,   // tissue damage threshold (porcine model: 7.5 N)
    requiresHumanPresence: true,  // surgeon must be at console
    timeWindow: {           // token valid only for procedure duration
      start: procedureStart,
      end: procedureEnd,
    },
  },
  revocable: true,          // surgeon can revoke at any time
}, hospitalKey);
```

### TEE Attestation

All T2/T3 surgical events require TEE-attested ProofReceipts:
```typescript
const receipt: SintProofReceipt = {
  // ...
  teeAttestation: {
    teeBackend: "arm-trustzone",  // Arm-based surgical console
    attestationQuote: "...",
    timestamp: "2026-04-03T10:00:00.000000Z",
  },
};
```

Regulatory requirement: EU MDR Article 10(9) — post-market surveillance records.

---

## Use Case 4: UAV / Drone (MAVLink)

**Scenario:** Last-mile delivery drone operating BVLOS (Beyond Visual Line of Sight)
in urban airspace. Communicates via MAVLink v2 to PX4 autopilot.
Operates under UTM (Unmanned Traffic Management) framework.

**Standards:** ASTM F3548-21 (UAS UTM), EU U-Space Regulation 2021/664,
EUROCAE ED-269 (UMAS DSS), FAA AC 107-2B (Part 107 waivers)

### Action Map

| Action | MAVLink Command | SINT Tier | Constraint | Rationale |
|--------|----------------|-----------|-----------|-----------|
| ARM | MAV_CMD_COMPONENT_ARM_DISARM (param1=1) | T3_COMMIT | — | Enables propulsion — irreversible in flight |
| DISARM | MAV_CMD_COMPONENT_ARM_DISARM (param1=0) | T3_COMMIT | — | May cause crash if in flight |
| TAKEOFF | MAV_CMD_NAV_TAKEOFF | T2_ACT | `altitudeLimitM: 120` | FAA Part 107: 400ft AGL |
| LAND | MAV_CMD_NAV_LAND | T2_ACT | — | Physical approach |
| MISSION_START | MAV_CMD_MISSION_START | T3_COMMIT | — | Begins autonomous BVLOS operation |
| WAYPOINT | MAV_CMD_NAV_WAYPOINT | T2_ACT | geofence: deliveryZone | Route deviation risk |
| RTL | MAV_CMD_NAV_RETURN_TO_LAUNCH | T2_ACT | — | Emergency return |
| SPEED CHANGE | MAV_CMD_DO_CHANGE_SPEED | T2_ACT | `maxVelocityMps: 20` | Urban airspace speed limit |
| SET_MODE (OFFBOARD) | MAV_CMD_DO_SET_MODE | T3_COMMIT | — | Companion computer takeover |
| FENCE DISABLE | MAV_CMD_DO_FENCE_ENABLE (param1=0) | T3_COMMIT | — | Removes safety boundary |
| CAMERA | MAV_CMD_IMAGE_START_CAPTURE | T0_OBSERVE | — | Inspection only |
| VELOCITY CMD | SET_POSITION_TARGET_LOCAL_NED | T2_ACT | `maxVelocityMps: 15` | Continuous flight control |

### BVLOS Token

```typescript
// APS delegation: logistics operator delegates to drone fleet
const apsScope: ApsDelegationScope = {
  resourceScope: ["delivery:bvlos-zone-a"],
  allowedActions: ["execute"],
  temporalValidity: { start: missionStart, end: missionEnd },
  spendLimit: 200,          // $200 operation budget
  attestationGrade: 2,      // infrastructure-attested fleet operator
};

// SINT mapping from APS scope
const { resource, actions, constraints, tierEscalation } =
  apsScopeToSintMapping(apsScope);

// Override physical constraints (not derivable from APS)
const droneToken = issueCapabilityToken({
  resource: "mavlink://1/*",
  actions: ["publish", "call"],
  constraints: {
    ...constraints,          // timeWindow from APS temporalValidity
    maxVelocityMps: 15,      // Urban UTM corridor limit
    geofence: deliveryZone,  // Authorized operation area
  },
}, fleetOperatorKey);
```

### Forbidden Sequences

- `ARM` → `SET_MODE(OFFBOARD)` within 2 s → T3_COMMIT (arm+offboard is full autonomous takeover)
- `FENCE_DISABLE` → any navigation command within 30 s → T3_COMMIT (fence was reason for route constraint)
- `system1.anomaly` → `MISSION_START` → T3_COMMIT (anomaly before mission start)

---

## Use Case 5: Collaborative Robot (Cobot) — ISO/TS 15066

**Scenario:** UR10e cobot working alongside humans on an assembly line.
Power-and-force limiting (PFL) mode. No safety fence — continuous human presence.

**Standards:** ISO/TS 15066 (collaborative robots), ISO 10218-2, ISO 13849-1 (PLd)

### Action Map

| Action | Resource | SINT Tier | Constraint | Rationale |
|--------|----------|-----------|-----------|-----------|
| Joint state monitoring | `ros2:///joint_state` | T0_OBSERVE | — | Continuous feedback |
| Path planning | `engine://system2/plan` | T1_PREPARE | — | Pre-approved trajectory |
| Move (PFL mode) | `ros2:///joint_commands` | T2_ACT | `maxVelocityMps: 0.25`, `maxForceNewtons: 150` | ISO/TS 15066 Table 1 transient contact |
| Move (hand-guiding) | `ros2:///joint_commands` | T1_PREPARE | `maxVelocityMps: 0.1` | Human-initiated movement |
| Tool activation | `ros2:///tool/enable` | T2_ACT | — | Physical tool engagement |
| Emergency stop | `ros2:///estop` | ALWAYS FORWARD | — | I-G2 invariant |

**ISO/TS 15066 Body Model limits (transient contact):**

| Body Region | Max Force (N) | Max Pressure (N/cm²) |
|-------------|--------------|----------------------|
| Head/skull | 130 | 50 |
| Chest | 140 | 45 |
| Upper arm | 150 | 50 |
| Hand | 140 | 30 |
| Thigh | 220 | 50 |

SINT enforces `maxForceNewtons: 150` as the global worst-case conservative limit.
Operators can set tighter per-region limits via geofence zones (e.g., head zone = 130 N).

---

## Use Case 6: Underwater ROV

**Scenario:** Remotely Operated Vehicle inspecting subsea infrastructure
(pipelines, cable crossings). Tethered, operated from surface vessel.

**Standards:** DNV-ST-0111 (assessment of ROV systems), IEC 60092 (electrical installations)

### Action Map

| Action | Resource | SINT Tier | Constraint | Rationale |
|--------|----------|-----------|-----------|-----------|
| Thruster velocity | `ros2:///cmd_vel` | T2_ACT | `maxVelocityMps: 1.0`, depth: context | Physical movement |
| Manipulator arm | `ros2:///manipulator/*` | T2_ACT | `maxForceNewtons: 200` | Subsea grab operations |
| Light control | `ros2:///lights/*` | T0_OBSERVE | — | Visual only |
| Camera gimbal | `ros2:///gimbal/*` | T1_PREPARE | — | Non-physical |
| Emergency surface | `ros2:///estop` | ALWAYS FORWARD | — | Emergency ascent |
| Sample collection | `ros2:///sampler/collect` | T2_ACT | confirmed: true | Sample container operation |
| Acoustic beacon | `ros2:///beacon/*` | T0_OBSERVE | — | Navigation reference |

### Depth Constraint Extension

```typescript
// Custom constraint: depth limit for shallow operations
const rovToken = issueCapabilityToken({
  resource: "ros2:///cmd_vel",
  actions: ["publish"],
  constraints: {
    maxVelocityMps: 1.0,
    maxForceNewtons: 200,
    // Geofence z-dimension used as depth limit:
    geofence: {
      type: "Polygon",
      coordinates: [[...surfacePolygon]],
      // metadata: { maxDepthM: 50 }  — operator convention
    },
  },
}, vesselOperatorKey);
```

---

## CSML Thresholds by Use Case

| Use Case | Default θ | Human-Present θ | Notes |
|----------|-----------|----------------|-------|
| Warehouse AMR | 0.30 | 0.15 | Human presence narrows threshold |
| Welding arm | 0.30 | 0.10 | Cell entry = tightest possible |
| Surgical robot | 0.10 | 0.10 | Always human-present; low tolerance |
| Drone BVLOS | 0.35 | 0.20 | Slightly relaxed for BVLOS regularity |
| Cobot PFL | 0.15 | 0.15 | Always human-present |
| Underwater ROV | 0.40 | — | Tethered, remote; relaxed baseline |

---

## Standards Compliance Matrix

| Standard | Req | SINT Mechanism |
|----------|-----|----------------|
| **IEC 62443 FR1** | Identity & Auth | Ed25519 tokens + W3C DID (did:key:z6Mk...) |
| **IEC 62443 FR2** | Use Control | T0–T3 tier gate + per-resource action allowlists |
| **IEC 62443 FR3** | Integrity | SHA-256 hash chain + TEE ProofReceipt (SGX/TZ/SEV) |
| **IEC 62443 FR4** | Confidentiality | Capability-scoped token access |
| **IEC 62443 FR5** | Data Flow | PolicyGateway allowlists + geofence + DFA per topic |
| **IEC 62443 FR6** | Timely Response | E-stop bypass invariant I-G2 |
| **IEC 62443 FR7** | Availability | Per-token rate limiting + budget caps |
| **ISO 10218-1 §5.4** | Speed/Force limits | `maxVelocityMps: 0.25`, `maxForceNewtons: 150` in token |
| **ISO/TS 15066 Table 1** | Human contact force | Per-zone force limits via geofence metadata |
| **EU AI Act Art. 13** | Logging + oversight | Append-only ledger + T3 human gate |
| **MAVLink/UTM (ASTM F3548)** | Drone safety | bridge-mavlink T3 on ARM/MISSION_START |
| **IEC 62304 Class C** | Surgical safety | All T2/T3 ProofReceipts TEE-attested |
| **ROSClaw (arXiv:2603.26997)** | LLM divergence | CSML per foundation_model_id in Avatar layer |

---

## APS ↔ SINT Cross-Protocol Authorization

When a robot operates across organizational boundaries (e.g., a delivery drone
from Org B enters Org A's airspace/building), the APS ↔ SINT bridge handles the
trust handoff without requiring a shared authorization server:

```
Org B (drone fleet operator)                    Org A (warehouse owner)
  │                                               │
  │  APS DelegationScope:                         │
  │  { resourceScope: ["logistics:bvlos-zone"],   │
  │    allowedActions: ["execute"],               │
  │    attestationGrade: 2,                       │
  │    spendLimit: 500 }                          │
  │                                               │
  │──── apsScopeToSintMapping() ─────────────────▶│
  │                                               │  SINT enforces:
  │                                               │  - velocity ≤ 15 m/s
  │                                               │  - geofence: buildingPolygon
  │                                               │  - timeWindow: delivery slot
  │                                               │  - rateLimit: 50 calls/hour
  │                                               │
  │◀─── sintTokenToApsProjection() ───────────────│
  │  APS Grade 2 attestation                      │
  │  dataAccessTerms: ["sint:maxVelocityMps:15"]  │
```

The physical constraints (velocity, geofence) live in SINT.
The digital constraints (spend limit, resource scope) live in APS.
Both are signed with Ed25519 over W3C did:key identities.

---

## Roadmap to Highest Standard

### Near-term (next 2 releases)

1. **MAVLink bridge** (bridge-mavlink) — ✅ now shipping
2. **ISO 10218 force-body model** — per-region force constraints via geofence zones
3. **Zenoh/DDS bridge** (bridge-zenoh) — native ROS 2 distributed middleware
4. **SROS2 security patches** — formal coverage of the 4 CVEs from ACM CCS 2022

### Medium-term

5. **OPC-UA bridge** (bridge-opcua) — IEC 62541, legacy PLC integration
6. **Hardware Security Module** (HSM) — hardware-rooted key management (PKCS#11)
7. **Biometric approval gate** — surgeon/operator identity at T3 via FIDO2
8. **ISO/TS 15066 body model** — per-region force limits computed from workspace geometry

### Academic trajectory

- **IROS 2026 submission** — "SINT: A Formal Security Layer for Physical AI Agents"
  - Proof of DFA invariants I-G1/I-G2/I-G3 using TLA+ or Coq
  - Empirical evaluation across 5 robot platforms (UR10e, Boston Dynamics Spot, UR5, DJI M300, Stäubli TX2)
  - Comparison with SROS2, OpenSSF Scorecard, ROS-I security guidelines
- **IEEE Robotics & Automation Letters** — "CSML: Composite Safety-Model Latency for LLM-Driven Physical Agents"
  - Full empirical validation on ROSClaw benchmark datasets
  - Cross-model comparison (GPT-4, Claude 3.5, Gemini 1.5 Pro, Llama 3.1)

---

*Generated by SINT Protocol v0.1 — 914 tests, 16 packages, 5 bridge adapters.*
*Cross-verification with APS (Agent Passport System): 9/9 tests pass, zero adapter code.*
