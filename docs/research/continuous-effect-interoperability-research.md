# Continuous Physical-Effect Interoperability

## Executive finding

SINT already authorizes individual requests through `PolicyGateway.intercept()`
and records decisions in an append-only evidence ledger. The missing primitive
is the lifecycle object for an effect that remains active between requests:
admit it, renew authority against current physical state, suspend it when
authority becomes inactive, and stop it safely with correlated evidence.

This is a concrete interoperability problem because each bridge can otherwise
invent different meanings for “active,” “renewed,” “revoked,” and “stopped.”
The first implementation is intentionally small: a protocol-neutral lease
state machine plus a JSON fixture that can be executed by independent runtimes.

## Evidence review

### Existing SINT behavior

- `PolicyGateway.intercept()` is the existing authorization choke point.
- Capability validation already checks signature, scope, expiry, revocation, and
  physical constraints on each intercepted request.
- The core evidence vocabulary already contains `action.started`,
  `action.completed`, `action.failed`, `action.rolledback`, and
  `safety.estop.triggered`.
- `BridgeAdapterState` already models `ACTIVE` and `SUSPENDED`, but it is a
  bridge-wide state and does not carry the action reference, renewal deadline,
  or token binding of one continuous effect.
- The prior fixture was proposal-only and tested the gateway boundary, but its
  stop path was represented in the test harness rather than by a reusable core
  lifecycle contract.

### External evidence

1. ROS 2 managed nodes define stable `active` and `inactive` states. The ROS 2
   lifecycle guidance describes activation as the point at which publishing
   occurs and deactivation as the transition that stops publishing and releases
   active resources ([ROS 2 lifecycle documentation](https://docs.ros.org/en/rolling/p/lifecycle/)).
2. OAuth token introspection defines “active” as a current decision, commonly
   requiring issuance, non-expiry, non-revocation, and resource validity. It
   also requires checking applicable token state and warns against caching
   authorization information beyond its expiry ([RFC 7662, sections 2.1,
   2.2, and 4](https://datatracker.ietf.org/doc/html/rfc7662)).
3. NIST Zero Trust Architecture rejects implicit trust based on location or
   ownership and puts identity and resource authorization at the center of
   enforcement ([NIST SP 800-207](https://csrc.nist.gov/pubs/sp/800/207/final)).

The combined implication is an engineering judgment, not a claim that these
documents standardize SINT’s vocabulary: a continuous physical effect needs an
explicit active state, fresh authorization checks, and a deactivation path that
is observable at the controlled resource boundary.

## Problem definition

Without a shared lease contract, a bridge can incorrectly keep publishing after
the last successful authorization, treat a revoked token as valid until a
process restart, renew without rechecking live force or velocity, or emit a
stop without an evidence link to the effect it stopped. These are distinct
failure modes from a single rejected request.

The minimum contract must therefore answer five questions:

| Question | Required behavior |
| --- | --- |
| Admission | Which gateway decision created or withheld the effect? |
| Renewal | Was authority checked again with current physical context? |
| Invalidation | Did expiry, revocation, or a failed renewal suspend the effect? |
| Stop | Did the runtime transition to a safe terminal state? |
| Evidence | Can an independent verifier correlate the decision and stop receipt? |

## Implemented slice

The current change set implements the smallest safe slice:

- `ContinuousEffectLease` carries token identity, resource, action reference,
  renewal deadline, expiry, and lifecycle state.
- `transitionContinuousEffect()` is a pure fail-closed transition function. It
  cannot authorize a request; callers must obtain admission and renewal through
  `PolicyGateway.intercept()` first.
- `ContinuousEffectCoordinator` owns lease bookkeeping and invokes the gateway
  for admission and every renewal. Renewal denial and deadline expiry invoke a
  configured stop callback and emit rollback evidence.
- Terminal `ROLLEDBACK` and `COMPLETED` states reject later renewal or other
  lifecycle events.
- The conformance fixture covers admission, live-state renewal, force-envelope
  denial, expiry, revocation, and stop evidence.
- Revoked-token denials now emit `policy.evaluated` at the gateway boundary so
  revocation is both fail-closed and auditable.

## Roadmap

### Phase 1 — Contract and reference runner (complete)

- Keep the vocabulary at proposal status.
- Add the core lease state machine and unit tests.
- Add the JSON fixture and reference conformance test.
- Require append-only decision and rollback receipt types.

### Phase 2 — Gateway-owned lease binding (complete for the reference gateway)

- [x] Add a gateway-facing lease coordinator that maps a successful admission or
  approval to one lease ID and action reference.
- [x] Require each renewal to call `intercept()` with fresh `physicalContext`.
- [x] Make missed renewal deadlines trigger the same safe-stop callback as explicit
  revocation, with no bridge-local authorization logic.
- [x] Add coordinator tests for denial-driven stop and terminal-state rejection.
- [ ] Add integration tests for expiry during an active effect and duplicate stop
  delivery.

### Phase 3 — Bridge adapters

- Implement the coordinator contract in ROS 2 lifecycle nodes first, mapping
  `ACTIVE` to publishing and `ROLLEDBACK` to deactivation/stop.
- Add MAVLink continuous setpoints and MQTT/Sparkplug sensor activation as
  second protocol implementations.
- Compare only fixture-level outputs: state, decision action, denial code, and
  receipt references.

### Phase 4 — Independent verification

- Obtain a second implementation outside the SINT reference runner.
- Run both implementations against the unchanged fixture.
- Record divergences as fixture or vocabulary issues rather than silently
  adding implementation-specific exceptions.
- Do not claim adoption until two independent implementations pass.

### Phase 5 — Production hardening

- Add bounded clock-skew policy and renewal jitter guidance.
- Add crash-recovery rules: an effect restarts `SUSPENDED`, never `ACTIVE`.
- Add bridge-specific physical stop acknowledgements and timeout evidence.
- Add ledger-chain verification to the fixture runner’s receipt checks.

## Acceptance criteria

The contract is ready for broader review when:

1. Every admission and renewal reaches `PolicyGateway.intercept()`.
2. Expired, revoked, or live-state-invalid authority never leaves an effect
   `ACTIVE`.
3. A stop request reaches `ROLLEDBACK` exactly once and causes a safe command or
   an explicit stop failure receipt.
4. Receipts include stable effect/action and authority references without raw
   sensitive payloads.
5. Two independent implementations pass the fixture unchanged.

## Sources

- Open Robotics, “ROS 2 lifecycle,” rolling documentation:
  https://docs.ros.org/en/rolling/p/lifecycle/
- IETF, Richer, “RFC 7662: OAuth 2.0 Token Introspection,” October 2015:
  https://datatracker.ietf.org/doc/html/rfc7662
- NIST, Rose et al., “SP 800-207: Zero Trust Architecture,” August 2020:
  https://csrc.nist.gov/pubs/sp/800/207/final
