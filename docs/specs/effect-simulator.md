# EffectSimulator and SimulationReceiptV2

Status: implemented contract, backend-independent
Version: 2.0.0

## Purpose

`EffectSimulator` is the backend-neutral preparation boundary for an action
that may change software, another agent, or the physical world. It previews or
simulates the exact proposed effect and returns signed evidence. It never
returns an authorization decision.

`PolicyGateway.intercept()` remains the sole authorization choke point.

## Protocol Flow

1. A bridge creates a schema-valid `SintRequest` with a UUID v7 request ID.
2. `PolicyGateway.preflightSimulation()` validates the request and capability
   token, computes the final consequence tier including CSML escalation, and
   returns an advisory `SimulationPreflight`.
3. The client submits the exact `EffectPlan` to an applicable
   `EffectSimulator` backend.
4. The backend executes deterministic checks, physics, a vendor twin, or a
   software dry-run and signs `SimulationEvidenceReceipt` V2.
5. The client attaches the receipt to the unchanged request and calls
   `PolicyGateway.intercept()`.
6. The gateway verifies the tier-selected evidence requirements. Valid
   evidence only permits normal policy evaluation to continue.
7. T2/T3 requests still enter the approval workflow. The execution broker
   atomically consumes the receipt nonce immediately before dispatch.
8. A local runtime shield rechecks current state and retains unconditional
   E-stop authority.

Preflight has `authorizesExecution: false`. Possession of a preflight response
or simulation receipt never permits execution without the final gateway
decision and any required approval resolution.

## Evidence Matrix

| Tier | Default requirement for supported effect classes | Approval behavior |
|---|---|---|
| T0 observe | None | Existing automatic decision |
| T1 prepare | Deterministic preview in shadow mode | Existing automatic decision |
| T2 act | `deterministic` or stronger | Existing human review |
| T3 commit | `physics` or `digital-twin`, required bindings, configured quorum of at least two | M-of-N human approval |
| Device control tick | No remote receipt | Local shield/controller only |

Deployments configure the matrix per effect class. A T2 medical-record update,
for example, should not be forced through a robot physics simulator; it may use
a rollback-only database simulator or declare the effect non-previewable and
escalate.

Evidence requirements and enforcement mode are separate. An action family in
`shadow` mode still receives a preflight requirement and runs the complete
receipt verifier, but a missing or rejected receipt is appended as
`simulation.receipt.rejected` with `enforcementMode: "shadow"` and cannot block
the request. A passing receipt is appended as `simulation.receipt.verified`.
T2/T3 remain `enforce` by default. Shadow mode is a calibration state, not an
authorization path, and promotion to enforcement is an explicit deployment
policy change.

Evidence grades are ordered:

1. `deterministic` — digest verification, schema/constraint evaluation,
   geometry, joint limits, transaction rollback, overlay diff, or dry-run.
2. `physics` — dynamic simulation with explicit model, scenarios, uncertainty,
   seeds, and measurable safety results.
3. `digital-twin` — a physics result additionally bound to a synchronized
   deployment twin or vendor controller model.

A stronger grade may satisfy a weaker requirement. A weaker receipt never
satisfies a stronger tier requirement.

## EffectSimulator Contract

Conceptual TypeScript interface:

```ts
interface EffectSimulator {
  readonly backend: string;
  readonly supportedGrades: readonly SimulationEvidenceGrade[];

  simulate(
    preflight: SimulationPreflight,
    worldSnapshot?: SimulationWorldSnapshot,
  ): Promise<Result<SimulationEvidenceReceipt, EffectSimulationError>>;
}
```

The interface above is exported by `@pshkv/core`. The reference millisecond-tier
implementation is `@pshkv/engine-effect-simulator`. Its bounded-motion model
checks declared joint positions, axis-aligned workspace targets, velocity,
force, clearance, collision count, and safety-zone violations. Missing inputs
produce signed `indeterminate` evidence; exceeded bounds produce signed `fail`
evidence. The worker has no authorization or hardware-dispatch dependency.

Every worker is given a `SimulationArtifactStore`. The reference implementation
includes an in-memory development store and a durable filesystem store that
shards objects by SHA-256 digest, writes atomically, and verifies content on
read. Receipt issuance fails closed if its canonical trace cannot be persisted
or the store returns a mismatched digest.

Every deterministic worker is also given a `SimulationReceiptRecorder`. The
reference `EvidenceLedgerSimulationReceiptRecorder` appends
`simulation.receipt.issued` using the simulator signing key as the event actor.
Its payload binds the exact signed receipt digest, request/effect/token/world/
artifact digests, simulator and scenario identities, outcome, validity window,
and `authorizesExecution: false`. The recorder can forward the resulting event
to a durable `LedgerStore`; failure in either the hash-chained writer or durable
sink returns `EVIDENCE_LEDGER_WRITE_FAILED`, and the receipt is not returned to
the caller. An already-persisted trace may remain as an unreferenced immutable
artifact after such a failure.

`@pshkv/bridge-ros2` exports `createROS2WorldSnapshot()` for the world-state
boundary. It binds synchronized odometry, joint state, transforms, map digest,
obstacles, localization confidence, and hardware safety-controller state into
a canonical short-lived snapshot. Required sources, maximum source age, clock
skew, and aggregate uncertainty are deployment policy. The separate
`persistROS2WorldSnapshot()` helper stores the exact canonical payload under
the digest carried by the receipt; neither helper can authorize or dispatch a
ROS 2 command.

## Isolated Worker HTTP Contract

`@pshkv/simulation-server` exposes the backend-neutral worker boundary:

- `GET /v1/health` publishes the backend, supported evidence grades, protocol
  version, and an explicit `authorizesExecution: false` statement.
- `POST /v1/simulate` accepts `{ preflight, worldSnapshot }` and returns either
  `{ receipt }` or a typed `{ error }`.

The worker rejects malformed or authorization-claiming preflights, applies a
bounded request-body limit, and supports constant-time bearer authentication.
Production deployments should terminate mTLS at the worker or its sidecar in
addition to bearer/workload identity.

`@pshkv/predictive-safety-client` implements `EffectSimulator` over this HTTP
surface. It enforces a deadline and validates the response schema, trusted
signer, Ed25519 signature, declared evidence grade, exact preflight digests,
resource/action, and world-snapshot digest locally. The Policy Gateway repeats
receipt verification during interception; client validation is defense in
depth and never an authorization decision.

The reference worker starts with `pnpm --filter @pshkv/simulation-server
start` after a build (or `dev` from source). Production requires
`SINT_SIM_BEARER_TOKEN`, `SINT_SIM_SIGNER_PUBLIC_KEY`, and
`SINT_SIM_SIGNER_PRIVATE_KEY`. `SINT_SIM_ARTIFACT_DIR` selects the durable
content-addressed trace store, while `SINT_SIM_MODEL` supplies the bounded
motion model as JSON. Development may use an explicitly warned ephemeral
signer; production startup fails closed without persistent identity.

Example backends:

- filesystem overlay returning a content-addressed diff
- database rollback-only transaction returning affected rows and constraints
- Kubernetes or cloud-provider dry-run/plan
- remote-agent `prepare()` response with a signed declared-effect digest
- MoveIt or equivalent deterministic geometry checker
- Gazebo, Isaac Sim, or vendor virtual-controller/digital-twin worker

Unknown or non-previewable high-impact effects return an explicit
`indeterminate`/unsupported result; they never silently pass.

## Receipt V2 Binding

The canonical receipt schema is
[`simulation-receipt.schema.json`](./simulation-receipt.schema.json).

The Ed25519 signature covers every receipt field except `signature`, serialized
with SINT canonical JSON. The receipt binds:

- schema version, receipt UUID v7, evidence grade, nonce, and expiry
- exact request, effect-plan, and complete capability-token digests
- resource and action
- world-state digest, observation time, validity, epoch, and uncertainty
- backend, version, model digest, and optional immutable image digest
- scenario-set digest, run count, coverage, and deterministic seeds
- pass/fail/indeterminate outcome and safety measurements
- assumptions and unsupported phenomena
- durable artifact digest
- optional robot, tool, payload, controller, cell, and policy digests
- signer public key and signature

## Verification Rules

The gateway fails closed when required evidence is missing or any of the
following is true:

- signer is not trusted, the signature is invalid, or the claimed evidence
  grade exceeds the signer's configured accreditation
- receipt grade is below the final tier requirement
- request, parameters, effect plan, token, resource, or action changed
- receipt or world snapshot is expired, stale, future-dated, or internally
  time-inconsistent
- backend, scenario count, coverage, uncertainty, missing binding, or binding
  value violates policy
- result is failed or indeterminate, or reports collision/zone violations
- predicted force, velocity, torque, jerk, or angular velocity exceeds the
  capability-token envelope
- required physical metrics are omitted
- unsupported phenomena are declared under a fail-closed policy
- receipt nonce is already consumed
- the token's approval quorum is below the tier requirement

The execution broker, not policy evaluation, performs atomic nonce consumption.
This preserves safe/idempotent approval retries while preventing two dispatches
from the same receipt.

## Threat Model

The contract explicitly addresses:

- forged or untrusted simulator output
- replayed receipts
- time-of-check/time-of-use world-state drift
- action or parameter substitution after simulation
- token substitution or attenuation bypass
- compromised/stale simulator images and models
- optimistic caller-supplied collision results
- insufficient scenario coverage and unknown model domains
- a simulator attempting to become an authorization authority

It does not claim that simulation proves universal physical safety. Certified
controllers, hardware interlocks, local deterministic enforcement, and E-stop
remain independent and authoritative within their existing scopes.
