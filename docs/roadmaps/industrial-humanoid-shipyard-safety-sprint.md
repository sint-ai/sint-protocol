# Industrial Humanoid Shipyard Safety Sprint

Status: Sprint 2 bridge and evidence-export scaffolding shipped

This sprint turns the Persona-style industrial humanoid opportunity into a
SINT product lane: safety policy, certification evidence, and runtime receipts
for shipyard robots doing welding, inspection, confined-space, and material
handling work.

## Sprint Goal

Make SINT legible as the runtime safety and evidence layer for industrial
humanoid deployments in shipyards.

The output is not a vendor integration. It is a vendor-neutral pack that a
Persona-style deployment, shipyard operator, classification society, or robotics
integrator can map onto their own controllers, simulators, and permit systems.

## Why This Matters

Industrial humanoids are moving from demos into heavy-industry tasks. The hard
problem is not only locomotion or manipulation. It is proving that a robot was
allowed to do a specific high-consequence action under the right permits,
constraints, simulation evidence, and human oversight.

SINT is strongest at that boundary:

- pre-action policy gate
- physical constraints in scoped authority
- T2/T3 approval routing
- e-stop rollback evidence
- append-only hash-chained ledger
- portable receipts for supervisors, surveyors, and incident review

## Workstreams

### S1. Policy Profile and Fixture Pack

Deliverables:

- shipyard policy templates for hot work, confined space, material handling,
  and inspection
- scenario pack for welding permit, fire watch, fume extraction, gas monitor,
  human proximity, load envelope, simulation receipt, and e-stop
- stable evidence events and policy violation codes

Status: complete in
`packages/conformance-tests/fixtures/industrial/industrial-humanoid-shipyard-safety-pack.v1.json`

### S2. Simulation and Program Binding

Deliverables:

- offline welding program digest binding
- simulation receipt digest binding
- mismatch denial scenario before arc start

Status: complete in the `simulation-receipt-mismatch` scenario.

### S3. Safety-Case Evidence

Deliverables:

- FMEA rows tied to executable scenarios
- ABS-style evidence export fields
- data-quality rules for clock sync, calibrated sensors, and program binding
- support-only claim boundaries

Status: complete in the fixture and conformance test.

### S4. Persona-Facing Outreach Pack

Deliverables:

- operator guide
- Persona fit brief
- verification commands
- next-step integration proposal

Status: complete in:

- `docs/guides/industrial-humanoid-shipyard-safety-pack.md`
- `docs/community/persona-ai-shipyard-safety-brief.md`

## Sprint 2 Candidate

Sprint 2 adds bridge-level scaffolding that maps controller and evidence
surfaces into the executable profile:

- ROS 2 / MoveIt action mapping for humanoid manipulation
- OPC UA safety PLC permit, fire-watch, fume extraction, gas-monitor, interlock,
  and e-stop resource mapping
- Isaac Sim / weld-simulator receipt adapter
- `sintctl shipyard evidence export` command for hash-chained JSONL records

Shipped code:

- `packages/bridge-ros2/src/shipyard-humanoid-profile.ts`
- `packages/bridge-opcua/src/shipyard-safety-signals.ts`
- `apps/sintctl/src/shipyard.ts`

Remaining candidate:

- dashboard card for hot-work approvals and evidence replay

## Validation

Run:

```bash
pnpm --filter @pshkv/conformance-tests exec vitest run src/industrial-humanoid-shipyard-safety-pack-conformance.test.ts
pnpm --filter @pshkv/conformance-tests test:fixtures
pnpm --filter @pshkv/bridge-ros2 test
pnpm --filter @pshkv/bridge-opcua test
pnpm --filter @pshkv/sintctl test
pnpm run docs:build
```

## Definition of Done

- New fixture pack is executable.
- All scenarios have deterministic expected decisions.
- FMEA rows point to executable scenario IDs.
- ABS-style evidence fields are declared.
- Docs explain Persona fit without making certification claims.
- Full fixture suite remains green.
