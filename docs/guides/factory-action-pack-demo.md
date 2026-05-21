# Factory Action Pack Demo

This guide is the refusal-first demo narrative for Sprint 1 of the Factory
Action Pack.

The purpose is not to claim live industrial execution. The purpose is to show
the control boundary clearly:

```text
prompt -> structured factory plan -> simulation required -> human approval -> signed receipt
```

## Demo Goal

Show that SINT behaves like a control layer for AI-generated factory actions.

In this first pack, the most important proof is refusal:

- the factory plan is generated
- the action profile is structured
- execution is blocked when simulation proof is missing
- after simulation proof exists, approval is still required
- the final outcome is receipt-backed

## Prompt

```text
Create a robotic inspection and palletizing line for 60 boxes per minute using
ABB or FANUC robots, a Siemens PLC, and human-safe collaborative zones.
```

## Step 1. Compile The Intent

The prompt compiles into a `FactoryIntent` object:

```json
{
  "intent_id": "fi_packaging_001",
  "goal": "Build a robotic inspection and palletizing line for 60 boxes per minute",
  "industry": "consumer_goods",
  "materials": ["corrugated_box"],
  "stations": ["inspection", "palletize", "outfeed"],
  "constraints": {
    "max_capex_usd": 500000,
    "floor_space_m2": 80,
    "takt_time_seconds": 1,
    "human_collaboration": true,
    "safety_standard_targets": ["ISO_10218", "ISO_TS_15066", "IEC_62443"]
  }
}
```

Reference:

- [Factory Intent Schema](../specs/factory-intent.schema.json)

## Step 2. Build The Cell Graph

That intent turns into a `CellGraph`:

```json
{
  "cell_id": "packaging_cell_001",
  "assets": [
    {
      "asset_id": "robot_abb_irb_1200_01",
      "type": "robot_arm",
      "vendor": "ABB",
      "controller": "OmniCore",
      "adapter": "sint-adapter-abb-rapid",
      "safety_zone": "zone_A"
    },
    {
      "asset_id": "plc_siemens_1500_01",
      "type": "plc",
      "vendor": "Siemens",
      "controller": "S7-1500",
      "adapter": "sint-adapter-siemens-tia-srci"
    }
  ],
  "flows": [
    {
      "from": "inspection",
      "to": "palletize",
      "material": "corrugated_box",
      "rate_per_minute": 60
    }
  ],
  "approval_tier": "T3_HUMAN_REQUIRED",
  "simulation_required": true
}
```

Reference:

- [Cell Graph Schema](../specs/cell-graph.schema.json)

## Step 3. Request Robot Action

The first real action becomes a `RobotActionProfile`:

```json
{
  "action_type": "robot.motion.pick_and_place",
  "target_robot": "robot_abb_irb_1200_01",
  "motion": {
    "source_pose": "inspection_conveyor_exit",
    "target_pose": "pallet_station_A",
    "max_velocity_mps": 0.25,
    "max_force_newtons": 80,
    "collision_check": true
  },
  "tool": {
    "type": "vacuum_gripper",
    "payload_kg": 2.4
  },
  "requires": {
    "simulation_receipt": true,
    "human_approval": true,
    "safety_zone_clear": true
  }
}
```

Reference:

- [Robot Action Schema](../specs/robot-action.schema.json)

## Step 4. Refuse Without Simulation

The correct first outcome is denial or escalation, not motion.

Expected reasoning:

- the action crosses into `T2_act` or `T3_commit`
- `simulation_receipt_present == false`
- industrial policy blocks execution

Illustrative decision:

```json
{
  "action": "deny",
  "assignedTier": "T3_commit",
  "denial": {
    "reason": "SIMULATION_RECEIPT_MISSING",
    "policyViolated": "sint.factory.robot.motion.v1"
  }
}
```

Reference:

- [Industrial Policy Pack](../specs/industrial-policy.yaml)

## Step 5. Attach Simulation Proof

After a valid simulator run, the action can carry a `SimulationReceipt`:

```json
{
  "simulation_receipt_id": "simr_packaging_001",
  "cell_id": "packaging_cell_001",
  "simulator": "RobotStudio",
  "vendor_program_hash": "sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  "collision_free": true,
  "cycle_time_seconds": 2.4,
  "safety_zone_violations": 0,
  "max_force_newtons": 62,
  "approved_for_execution": false,
  "signed_by": "sint-simulation-gateway"
}
```

Reference:

- [Simulation Receipt Schema](../specs/simulation-receipt.schema.json)

## Step 6. Require Approval Before Execution

Simulation proof should not silently imply execution permission.

The next correct state is escalation:

```json
{
  "action": "escalate",
  "assignedTier": "T3_commit",
  "escalation": {
    "requiredTier": "T3_commit",
    "timeoutMs": 300000
  }
}
```

Only after approval does the action proceed to an execution receipt.

## Step 7. Emit A Signed Outcome

The useful story is that SINT can explain all three outcomes:

- refused because simulation proof was missing
- escalated because physical execution required approval
- allowed with a receipt after simulation and approval requirements were met

That is a stronger industrial story than "we support robots."

## Files In This Demo Pack

- [Industrial Action Profile](../specs/sint-industrial-action-profile.md)
- [Factory Intent Schema](../specs/factory-intent.schema.json)
- [Cell Graph Schema](../specs/cell-graph.schema.json)
- [Robot Action Schema](../specs/robot-action.schema.json)
- [Simulation Receipt Schema](../specs/simulation-receipt.schema.json)
- [Industrial Policy Pack](../specs/industrial-policy.yaml)

## What This Demo Is

- a control-standard pack
- a refusal-first execution story
- a clear explanation of where simulation proof and approval fit

## What This Demo Is Not

- a live Siemens, ABB, FANUC, or UR adapter
- a claim of certified industrial deployment
- a replacement for safety PLCs, vendor engineering tools, or assessors
