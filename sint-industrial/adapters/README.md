# Industrial Adapter Contract

Adapters are translation layers. They convert SINT factory-control objects into
vendor, fieldbus, simulator, or middleware-specific surfaces.

Adapters do not authorize actions. Every action that can affect a physical
system must already have passed through `PolicyGateway.intercept()`.

## Required Boundary

Every adapter must preserve this path:

```text
FactoryIntent
  -> CellGraph
  -> RobotActionProfile
  -> SimulationReceipt
  -> PolicyGateway.intercept()
  -> human approval or quorum
  -> adapter translation
  -> execution receipt
  -> EvidenceLedger
```

## Adapter Responsibilities

An adapter is responsible for:

- mapping SINT resources to the vendor or protocol address space
- validating that required evidence is present before translation
- producing deterministic command or program artifacts where possible
- preserving the simulation receipt, approval ID, and receipt-chain digest
- returning a refusal receipt when required evidence is missing
- making live-control status explicit

An adapter is not responsible for:

- bypassing `PolicyGateway.intercept()`
- issuing or widening capability tokens
- deciding risk tier directly
- treating simulation output as execution permission
- hiding vendor-specific safety interlocks from the receipt chain

## Minimum Evidence

Active and planned industrial adapters must require:

- `simulationReceipt`
- `humanApproval`
- `factoryReceiptChain`

Robot and PLC execution paths should also require one of:

- `forceVelocityEnvelope`
- `vendorProgramHash`
- `hardwareSafety`
- `plcInterlockState`
- `topicPolicy`

## Contributor Checklist

Before moving an adapter from `planned` to `active-profile`:

1. Add a deterministic mapping or export function.
2. Add tests for missing simulation proof, missing approval, and broken receipt chain.
3. Add conformance coverage in `packages/conformance-tests`.
4. Keep `claimsLiveControl` false until a real partner deployment validates the path.
5. Document exactly which vendor API, simulator export, or fieldbus surface is covered.
