# Spatial Mission Authorization Sprint Plan

Date: 2026-06-04

## Why now

Recent public reporting on Ukraine's expanded UGV logistics, casualty evacuation,
and civilian rescue operations shows that mission-critical robots are moving from
single-purpose demos into high-tempo dual-use fleets. The same robot class may
carry ammunition, evacuate wounded people, rescue civilians, perform engineering
work, or support security operations inside the same week.

For SINT, the strategic upgrade is spatial mission authorization: every physical
action remains token-bound and routed through `PolicyGateway.intercept()`, but
tokens can also require fresh localization evidence, mission-class continuity,
and corridor/zone proof before a robot action proceeds.

## Sprint objective

Make SINT enforce token-bound spatial mission envelopes for autonomous logistics,
rescue, evacuation, and public-safety robotics without weakening existing
capability-token, evidence-ledger, or e-stop invariants.

## Non-negotiable invariants

- All authorization decisions continue to flow through `PolicyGateway.intercept()`.
- Spatial limits live in capability tokens or signed execution envelopes, not
  bridge-local config.
- Runtime spatial plugins may tighten constraints but never widen token scope.
- Missing required spatial proof fails closed for T2/T3 movement.
- E-stop remains unconditional and bypasses token checks.
- Evidence is appended, never edited.

## Sprint backlog

### P0 - Token-bound spatial mission envelope

Status: implemented

- Add mission class to execution envelopes.
- Add request localization evidence fields: position, heading, confidence,
  observation time, and coordinate frame.
- Deny mission drift, such as using a civilian-rescue token for a combat mission.
- Deny missing, stale, low-confidence, or wrong-frame localization when the token
  requires spatial proof.
- Add PolicyGateway tests for each denial path and the fresh/confident happy path.

### P1 - Geometry-backed corridor proof

Status: partially implemented

- Add a corridor resolver/verifier plugin for signed corridor geometry.
- Verify current position is inside the approved corridor/geofence.
- Enforce lateral and heading deviation using token `maxDeviationMeters` and
  `maxHeadingDeviationDeg`.
- Emit `policy.spatial.corridor_verified` and `policy.spatial.corridor_violation`
  evidence events.
- Add a reusable static local-frame polygon/centerline verifier for immediate
  warehouse, rescue-lane, and test-map deployments.
- Remaining: add adapters/resolvers for ecosystem map formats such as GeoJSON,
  Open-RMF lanes, ROS 2 Nav2 routes, and MAVLink mission fences.

### P1 - Bridge population of spatial context

Status: partially implemented

- Populate ROS 2 request context from odometry, TF frame, and localization
  confidence where available.
- Populate MAVLink request context from GPS/local position, EKF health, and
  mission item state.
- Preserve bridge neutrality: bridges normalize facts, gateway decides.
- Implemented: MAVLink `SET_POSITION_TARGET_LOCAL_NED` now populates local
  position, heading, observation time, and `mavlink-local-ned` frame when the
  message actually includes position/yaw fields. Velocity-only setpoints do not
  claim position proof.
- Remaining: add ROS 2 odometry/TF population and richer MAVLink EKF/GPS
  confidence when telemetry sources are available.

### P2 - Multi-robot corridor coordination

Status: planned

- Add corridor reservation/occupancy hooks for fleets.
- Enforce maximum robots per zone, minimum convoy spacing, and route conflict
  prevention.
- Add conformance fixtures for warehouse AMR and evacuation corridor scenarios.

### P2 - Rescue/logistics safety pack

Status: planned

- Add reusable geofence templates for evacuation corridors, casualty pickup
  points, staging zones, and no-go hazard zones.
- Add operator-facing approval receipt fields: mission class, corridor ID,
  localization age, confidence, frame ID, and last verified zone.

## Acceptance criteria

- `pnpm --filter @pshkv/gate-policy-gateway test` passes.
- Capability-token schema accepts spatial mission envelopes.
- Policy request schema accepts localization evidence and rejects malformed
  evidence.
- Gateway denies mission drift and missing/stale/low-confidence spatial proof.
- Gateway denies missing corridor verifiers, verifier failures, outside-corridor
  results, and over-limit lateral/heading deviations when token envelopes require
  corridor proof.
- Gateway still escalates valid T2 robot movement rather than silently allowing it.
- Existing corridor ID, hardware permit, geofence, dynamic envelope, and e-stop
  behavior remains intact.

## Execution notes

The first slice deliberately avoids adding bridge-specific assumptions. ROS 2 and
MAVLink should populate spatial evidence later, but the policy boundary is useful
immediately because tests and SDK callers can exercise the contract directly.
