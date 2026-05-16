# Industrial Cell Safety Pack

This guide defines the H5 safety-case support package for automotive and
industrial humanoid deployments.

SINT does not replace a certified safety PLC, robot controller, guard-door
interlock, or assessor. This pack turns SINT runtime evidence into reviewable
support artifacts for industrial safety, FMEA, SOTIF, ISO 26262-style analysis,
and post-incident reconstruction.

The executable fixture is
`packages/conformance-tests/fixtures/industrial/industrial-cell-safety-pack.v1.json`.
The conformance test is
`packages/conformance-tests/src/industrial-cell-safety-pack-conformance.test.ts`.

## Scope

The first cell scenario is an automotive-style humanoid workcell:

- humanoid assembly agent
- safety PLC
- cell operator
- line supervisor
- guard-door interlock
- hardware permit
- zone reservation
- manipulation request
- emergency stop

The pack is intentionally framed as alignment support. Final certification and
hazard analysis remain the responsibility of qualified assessors and the
deployment owner.

## Policy Templates

The fixture defines three policy templates:

| Template | Resource | Default tier |
| --- | --- | --- |
| Guard door | `opcua://*/GuardDoor/*` | T3 |
| Zone reservation | `humanoid://*/workspace/*/reserve` | T1 |
| Manipulation | `humanoid://*/arm/*/joint_commands` | T2 |

Each template requires fresh hardware safety context:

- `permitState: granted`
- `interlockState: closed`
- `estopState: clear`
- observed age no older than 5 seconds

## Required Scenarios

H5 requires one industrial-cell fixture to cover:

- guard-door interlock open
- zone occupied by a human worker
- hardware permit revoked before actuation
- emergency stop under load

Each case must have:

- expected decision
- assigned tier
- policy violation or rollback reason
- safety evidence event
- controller or rollback reference where relevant

## FMEA Export

The FMEA rows are generated from scenario identifiers, not from detached prose.
Each row includes:

- failure mode
- hazard
- SINT detection
- SINT control
- severity
- occurrence
- detection
- required evidence fields

The conformance test calculates a risk priority number and verifies that every
FMEA row points back to an executable scenario.

## Timing Report

The safety timing report is anchored to
`packages/conformance-tests/fixtures/industrial/hardware-safety-phase-a-kpis.json`.

Required KPIs:

- hardware permit handshake p99: less than 40 ms
- e-stop propagation p99: less than 20 ms
- T2/T3 fail-open incidents: 0

These targets should be measured with hardware-in-the-loop or certified
simulator setups before production claims are made.

## SOTIF / ISO 26262 Boundary

Use careful language:

- SINT supports runtime authorization, evidence, and post-incident traceability.
- SINT can document interactions with certified safety controllers.
- SINT does not certify robot hardware or replace safety PLC logic.
- SINT evidence should be reviewed by qualified assessors for the final safety
  case.

## Verification

Run:

```bash
pnpm --filter @pshkv/conformance-tests test -- src/industrial-cell-safety-pack-conformance.test.ts
pnpm --filter @pshkv/conformance-tests test:fixtures
```

## Exit Criteria

- Guard-door, zone-occupancy, permit-revocation, and emergency-stop scenarios
  are executable.
- FMEA rows reference executable scenarios.
- Timing report references hardware permit and e-stop KPI targets.
- SOTIF / ISO 26262 claims remain support-only unless a certified assessor
  signs off.
