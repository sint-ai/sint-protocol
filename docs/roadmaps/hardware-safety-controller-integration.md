# Hardware Safety Controller Integration Roadmap (2026)

## Goal

Integrate SINT policy decisions with dedicated hardware safety controllers (PLC safety relays, SIL-rated safety PLCs, industrial safety I/O) so software policy and hardwired fail-safe paths stay synchronized.

## Scope

- In scope: signal contracts, bridge profiles, evidence semantics, validation scenarios, rollout phases.
- Out of scope: replacing certified safety PLC logic or claiming SIL certification for SINT software.

## Architecture Pattern

1. `SINT PolicyGateway` remains the authorization and governance decision layer.
2. `Hardware Safety Controller` remains final authority for emergency stop, interlock, and safe torque off.
3. `Bridge adapters (ROS2/OPC UA/MQTT)` publish both:
   - commanded action intent (software path), and
   - safety handshake state (hardware path).
4. `EvidenceLedger` records synchronized software and hardware safety state transitions.

## Interface Contract v1

### Control-plane to hardware signals

- `sint.safety.intent` (software intent, pre-actuation)
- `sint.safety.permit` (hardware permit required for T2/T3 execution)
- `sint.safety.estop` (unconditional stop signal)
- `sint.safety.interlock` (cell/zone interlock state)

### Required behavior

- T0/T1 may proceed without hardware permit by deployment policy.
- T2/T3 must fail-closed when `permit != granted`.
- Hardware `estop` preempts all software approvals (I-G2 invariant).
- Bridge reconnect must not replay stale `permit` state.

## Rollout Phases

### Phase A — Q2 2026: Signal + evidence alignment

- Define canonical signal/resource URIs for ROS2, OPC UA, and Sparkplug.
- Add ledger payload conventions for `permit`, `interlock`, and `estop` transitions.
- Add fixture tests for "permit missing", "permit revoked mid-action", and "estop under load".

### Phase B — Q3 2026: Pilot integrations

- Pilot 1: warehouse AMR zone controller (safety scanner + relay I/O).
- Pilot 2: industrial cell safety PLC (robot enable + guard-door interlock).
- Validate end-to-end latency budgets including hardware handshake.

### Phase C — Q4 2026: Certification-ready pack

- Publish deterministic interop fixtures for ROS2↔PLC and OPC UA↔PLC paths.
- Provide benchmark report including software + hardware safety handshake timing.
- Publish design-partner case study with incident-response replay evidence.

### Phase D — Q4 2026: PX4 Encrypted Log Evidence Lane

Use PX4 encrypted ULog (`.ulge`) as a first-class evidence input for SINT
incident review and policy-receipt correlation.

- Treat encrypted PX4 logs as source-of-truth flight telemetry for high-risk
  physical actions.
- Correlate SINT `requestId` / policy events with decrypted ULog timeline
  during incident replay.
- Keep private decrypt keys outside runtime nodes; decrypt only in review
  pipeline.

Reference baseline from PX4 docs:

- encryption algorithm path (`XChaCha20`) and wrapped symmetric key model
- firmware enablement via crypto modules + board key config
- `.ulge` single-file format in recent PX4
- `Tools/log_encryption` download/decrypt workflow

### PX4 integration tasks (execution-ready)

1. Add a conformance fixture profile for "SINT decision timeline matches PX4
   decrypted ULog event windows" on offboard actions.
2. Add a guide that documents operator flow:
   - collect `.ulge`
   - decrypt in controlled environment
   - map ULog timestamps to SINT evidence events
3. Add a bridge-level evidence pointer field for PX4 encrypted log artifacts
   (file hash + key identifier reference, never private key material).
4. Add fail-closed policy profile option for safety-critical fleets:
   - deny T2/T3 if required encrypted logging capability is unavailable.
5. Publish one benchmark note for correlation latency budget
   (decision-to-verified-flight-event alignment).

## KPI Targets

- ROS2 software intercept p99: `< 10ms` (`benchmark:ros2-loop`)
- Hardware permit handshake (policy decision -> hardware permit observed): `< 40ms` p99 at edge gateway
- E-stop propagation (hardware trigger -> bridge blocked): `< 20ms` p99
- T2/T3 fail-open incidents: `0`

## Test Scenarios

- Human enters aisle during motion command.
- Guard door opens during manipulator movement.
- Hardware permit drops after T2 approval but before actuation.
- Edge disconnect + reconnect with stale permit cache.
- Immediate revocation under concurrent command load.

## Deliverables

- Bridge profile addendum for safety-controller handshake resources.
- Conformance fixture bundle for hardware-linked safety transitions.
- Benchmark report section for hardware safety handshake latency.
- Deployment runbook for staged rollout with fallback safe modes.
