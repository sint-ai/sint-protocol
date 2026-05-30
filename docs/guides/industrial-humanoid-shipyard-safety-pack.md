# Industrial Humanoid Shipyard Safety Pack

This guide defines a SINT safety and evidence pack for industrial humanoids
working in shipyards, with emphasis on welding, hot work, confined-space entry,
inspection, material handling, and remote survey evidence.

The target deployment shape matches companies building humanoid robots for
heavy industry: a robot may inspect a hull block, enter a shared work zone,
start a welding arc, grind material, lift parts, or generate evidence for a
supervisor and surveyor. SINT sits before those actions as the policy gateway.

Executable fixture:

- `packages/conformance-tests/fixtures/industrial/industrial-humanoid-shipyard-safety-pack.v1.json`

Conformance test:

- `packages/conformance-tests/src/industrial-humanoid-shipyard-safety-pack-conformance.test.ts`

## Scope

The pack covers one shipyard block:

- industrial humanoid welder
- welding supervisor
- fire watch
- safety PLC
- remote surveyor
- shipyard operator
- welding torch, grinder, inspection camera, and material gripper

SINT does not certify welding procedures, shipyard safety, robot hardware,
classification-society acceptance, or OSHA compliance. It provides policy
decisions, receipts, and evidence records that can support those processes.

## Policy Templates

| Template | Resource | Default tier |
| --- | --- | --- |
| Hot-work welding | `humanoid://shipyard/robot/*/tool/welding-torch/*` | T3 |
| Confined-space entry | `humanoid://shipyard/robot/*/workspace/*/confined-space/enter` | T3 |
| Material handling | `humanoid://shipyard/robot/*/material/lift` | T2 |
| Visual inspection | `humanoid://shipyard/robot/*/inspection/*` | T0 |

Hot-work welding requires:

- hot-work permit
- fire-watch readiness
- fume extraction online
- safe gas-atmosphere context
- simulation receipt bound to the submitted welding program digest
- fresh safety-controller context

## Required Scenarios

The executable pack covers:

- visual inspection allowed as T0 observe
- welding denied without a hot-work permit
- welding denied when fire watch is not ready
- welding denied when fume extraction is offline
- confined-space entry denied when gas atmosphere is unsafe
- bystander in weld zone escalates to T3
- simulation receipt mismatch denied before arc start
- valid weld start escalates for supervisor approval
- material lift over envelope denied
- e-stop during weld rolls back unconditionally

## ABS-Style Evidence Export

The fixture defines an evidence export profile for remote survey, audit replay,
data-quality review, and incident reconstruction. Required fields include:

- site and vessel block identifiers
- robot and work-order identifiers
- weld procedure specification reference
- hot-work permit and fire-watch operator identifiers
- gas monitor calibration reference
- fume extraction status
- simulation receipt digest
- policy decision and tier
- hash-chain fields: `eventHash`, `previousHash`

Data quality rules require clock sync, calibrated sensors, and program digest
binding between simulation and execution.

## Persona AI Fit

Persona AI publicly describes industrial humanoids for shipyards, energy,
construction, and manufacturing, including human coworker safety and
supervisor/bystander coordination. This pack translates that operating model
into SINT controls:

- every welding or confined-space action is pre-gated
- every denial/escalation has a receipt
- every simulation-to-execution drift case is blocked
- every incident can be reconstructed through hash-chained evidence
- every support claim stays inside evidence and runtime-governance boundaries

## Verification

Run the targeted pack:

```bash
pnpm --filter @pshkv/conformance-tests exec vitest run src/industrial-humanoid-shipyard-safety-pack-conformance.test.ts
```

Run all fixture contracts:

```bash
pnpm --filter @pshkv/conformance-tests test:fixtures
```

## Exit Criteria

- Hot-work, fire-watch, fume extraction, atmosphere, bystander, simulation,
  supervisor-approval, load-envelope, and e-stop cases are executable.
- FMEA rows reference executable scenario IDs.
- Evidence export includes data-quality rules.
- Certification language remains support-only unless a qualified assessor signs
  off.
