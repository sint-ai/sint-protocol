# Dexterous Automation Data-Governance Roadmap

**Status:** active product roadmap  
**Updated:** 2026-09-21

## Decision

SINT should not try to compete with a wearable or collect raw EMG. Its best
position is the missing *governed path from expert demonstration to physical
execution*: prove which demonstrations trained a policy, what conditions they
were captured under, which model and robot configuration consumed them, and
what safety authority constrained every deployed action.

That is directly complementary to Axonnic's public workflow: it records EMG,
video, and hand pose from workers, retargets demonstrations into a robot action
space, and deploys a policy that relies only on the robot's own sensors. See
[Axonnic's product description](https://www.axonnic.com/).

## What exists today

| Capability | SINT status | Why it matters for dexterous automation |
| --- | --- | --- |
| Cryptographic authority and runtime force, velocity, geofence, rate, and approval limits | Implemented | A learned policy cannot silently exceed the bounds approved for a cell. |
| Append-only, hash-chained evidence ledger | Implemented | A deployment can be traced without making mutable training metadata the source of truth. |
| VLA runtime binding and short-lived action chunks | Implemented | A checkpoint, action transform, calibration, embodiment, or sensor-layout substitution fails closed. |
| OpenPI remote inference bridge | Implemented | A remote policy is authenticated, fresh, replay-protected, simulation-bound, and governed before execution. |
| Demonstration dataset provenance | Implemented as a standalone validation package | Manifests preserve consent, calibration, synchronization, stream, task, and retargeting evidence without retaining biometric payloads. |
| Dataset-to-checkpoint lineage and promotion approval | Implemented as a standalone validation package; gateway binding pending | A promotion request now requires eligible manifests, a lineage digest, simulation evidence, rollback, and approver identity. |
| Pilot operator metrics | Partial | The approval/audit surfaces exist; dexterous-task data quality and intervention metrics do not. |

## Roadmap

### P0 — governed inference foundation — complete

The VLA schemas, policy-gateway checks, execution-broker continuity/deadline
checks, safe-stop requirement, and authenticated OpenPI bridge are in the
repository. This pass also verified `@pshkv/bridge-openpi` (6 tests and build)
and `@pshkv/core` (76 tests).

**Acceptance condition:** an OpenPI response cannot become a robot command
without identity, freshness, runtime/artifact, action-space, world-snapshot,
simulation, token, and policy checks.

### P1 — human demonstration evidence contract — implemented

Add a versioned `DemonstrationManifest` and validator, storing only immutable
metadata and content digests—not biometric payloads—in SINT.

Required fields:

- opaque demonstrator pseudonym and explicit capture/processing consent receipt;
- task, workstation, material/tool, robot target, and approved operating-zone
  identifiers;
- digests for each recording stream (EMG, video, hand pose, force/torque),
  clock-sync evidence, calibration, and capture software;
- time range, sampling rates, sensor placement/version, quality checks, and
  redaction/retention policy;
- transformation/retargeting digest mapping the demonstration to the declared
  robot action space.

**Security requirements:** raw EMG/video stays in the customer-controlled data
plane; manifests have no direct identifiers; consent revocation marks data
ineligible for new training but never rewrites already-issued ledger evidence;
every digest is content-addressed and signed by the capture service.

**Implemented:** `@pshkv/demonstration-provenance` validates manifests before
they enter a training dataset. It stores only opaque pseudonyms and SHA-256
evidence digests.

**Acceptance condition:** a training job is rejected if any constituent
demonstration lacks consent, calibration/synchronization evidence, an approved
task scope, or integrity verification.

### P2 — dataset-to-checkpoint promotion gate — partial

Bind an approved dataset manifest set and training recipe digest to the model
runtime constraints already checked by the gateway. Introduce a promotion
request that requires simulation results, regression metrics, safety-envelope
compatibility, rollback checkpoint, and designated human approval before a new
checkpoint can receive an execution capability.

**Implemented:** the standalone promotion validator derives the dataset digest
from its sorted manifest digests and rejects ineligible data, missing
simulation, duplicate members, missing approval, or a candidate checkpoint used
as its own rollback. The approved dataset, training recipe, promotion evidence,
and rollback checkpoint can now be signed into `modelConstraints`; runtime
substitution fails capability validation in `PolicyGateway.intercept()`.
Successful lineage verification writes a digest-only `vla.lineage.verified`
event to the append-only ledger. A conformance fixture proves a substituted
lineage is denied before the execution broker can dispatch an adapter.
Dedicated digest-only constructors now cover admission, dataset assembly,
promotion, rollback, and training-eligibility revocation. The
`DemonstrationProvenanceOrchestrator` validates admission, dataset assembly,
and promotion before appending these facts through the hash-chained
`EvidenceLedger`. The remaining work is validation in a real guarded pilot.
Conformance covers both a valid demonstration-to-token path and fail-closed
lineage substitution before execution dispatch.

**Acceptance condition:** swapping either a dataset lineage or checkpoint after
approval invalidates execution authority; rollback is an auditable new event.

### P3 — pilot control room (2–3 weeks)

Add dashboard views for capture completeness, consent/retention state, model
lineage, per-chunk denials, approval latency, safe-stop count, contact-force
near-misses, successful-cycle rate, and human intervention rate. Aggregate by
cell and task, never by identifiable worker.

**Acceptance condition:** a manufacturing operator can explain a deployment's
data provenance, current safety authority, and failure rate from one immutable
audit trail.

### P4 — reference pilot (4–6 weeks, after P1)

Build a contained force-sensitive assembly or deformable-material cell:

1. Capture 20–50 expert sessions in a customer-controlled repository.
2. Generate and validate manifests; route consent or calibration failures to
   remediation before training.
3. Retarget to one declared robot/action-space profile and train in simulation.
4. Promote one checkpoint through P2 approval and run constrained action chunks
   in a guarded cell.
5. Compare cycle quality, intervention rate, safety-envelope violations, and
   recovery time with a non-governed baseline.

## Sequencing and ownership

Start P1 before dashboard work: visible metrics without immutable provenance
would create a polished but untrustworthy audit story. P2 follows P1 because a
checkpoint cannot honestly claim its training lineage until the demonstration
contract exists. P3 and the pilot can then run in parallel.

The capture vendor owns sensing hardware and raw-recording quality. The
manufacturer owns raw data and retention policy. SINT owns enforcement,
promotion authority, and tamper-evident operational evidence. The robot
integrator owns cell integration and safety validation. No party's model server
may grant itself execution authority.

## First implementation slice

The immediate code deliverable is P1's manifest package plus conformance tests
for: altered stream digest, missing consent, clock-sync/calibration mismatch,
out-of-scope task use, revoked training eligibility, and an attempted
dataset-to-checkpoint substitution. It should be wired into the existing VLA
runtime binding only after the standalone manifest contract and its failure
modes are stable.
