# VLA Governance and OpenPI Integration Plan

SINT treats vision-language-action (VLA) models as untrusted action proposers. A VLA policy may plan, remember, adapt, and emit low-latency action chunks, but only `PolicyGateway.intercept()` can authorize physical execution. The `ExecutionBroker` then verifies the approved request against fresh world state before a single dispatch.

## Implemented foundation

### Runtime artifact binding

`SintModelConstraints` and `SintModelRuntimeContext` bind the complete embodied runtime: checkpoint, policy configuration, normalization statistics, action transform, action-space schema, embodiment, calibration, and sensor layout. Any token-bound field that is absent or different at runtime fails capability validation.

### Rolling action chunks

`VlaActionChunkEnvelope` describes one short-lived chunk with its stream sequence, horizon, control rate, action count, action-space and embodiment identity, world snapshot, boundary states, dynamic maxima, deadline, and mandatory safe-stop behavior.

The gateway rejects chunks that are stale, exceed token limits, mismatch the active action space or embodiment, or are not bound to the simulated world snapshot. The broker additionally rejects skipped/replayed stream sequences and discontinuous transitions. A configured safe-stop callback runs on transition or dispatch failure.

### Intent, memory, and adaptation

- `VlaTaskIntentEnvelope` bounds language instructions, operations, objects, zones, visual subgoals, and control modality.
- `VlaMemoryEvidenceRef` makes embodied memory content-addressed and expiring. Text summaries must reference source evidence.
- `VlaAdaptationPermit` bounds the base and rollback checkpoints, trainable components, reward and dataset digests, trial/time/physical limits, simulation requirement, and expiry.

These contracts are signed when embedded in a capability token or bound into the request digest. Ledger records remain append-only; memory corrections and adapted checkpoints receive new digests.

## OpenPI adapter design

The first model integration should be a separate Python/GPU service behind a narrow bridge rather than a dependency inside SINT core.

1. The bridge captures observations and a task intent, content-addresses them, and requests an action chunk from the OpenPI policy server.
2. It verifies the server identity and maps the returned actions into a declared action-space schema.
3. It creates a `SintRequest` carrying runtime artifact bindings, task intent, memory references, the action chunk, and simulation evidence.
4. `PolicyGateway.intercept()` applies token, physical, VLA, novelty, and approval policy.
5. `ExecutionBroker.execute()` re-reads world state and enforces deadline, order, continuity, single-use evidence, and safe-stop behavior.

The execution orchestrator assigns chunk sequence numbers and advances them only after successful dispatch. Model proposal attempts and human-denied approvals therefore cannot create executable sequence gaps.

The transport must use mutual authentication, request freshness, replay protection, bounded queues, and safe-stop on disconnect. Checkpoint and model licenses must be reviewed independently of the OpenPI repository license.

## Delivery phases

| Phase | Deliverable | Status |
|---|---|---|
| P0 | VLA schemas, runtime binding, gateway chunk limits, broker continuity/deadline enforcement, safe-stop and conformance tests | Implemented |
| P1 | OpenPI bridge, observation/action codecs, authenticated remote-inference contract, simulator binding, freshness/replay protection | Implemented |
| P2 | Memory-evidence ledger events, intent-subgoal policy plugin, adaptation workflow and checkpoint promotion | Planned |
| P3 | Dashboard metrics for intervention rate, chunk violations, failed loops, throughput, adaptations, and emergency stops | Planned |

## Security invariants

- **I-VLA1:** Every action chunk declares unconditional safe-stop behavior.
- **I-VLA2:** A runtime artifact, action space, calibration, or embodiment substitution invalidates the capability.
- **I-VLA3:** Model-authored textual memory cannot be the sole provenance for a physical decision.
- **I-VLA4:** Chunk execution is ordered, deadline-bound, world-state-bound, and transition-continuous.
- **I-VLA5:** Adaptation never inherits execution authority implicitly; each promoted checkpoint requires a new digest and authorization.
- **I-VLA6:** Remote-policy responses are authenticated, fresh, single-use, runtime-bound, and structurally validated before policy evaluation.

The bridge exposes a secure structured-channel interface for `wss://` and authenticated `unix://` transports. Deployment-specific WebSocket/mTLS certificate loading remains outside the package so private keys stay in the platform transport or secrets manager rather than SINT application code.
