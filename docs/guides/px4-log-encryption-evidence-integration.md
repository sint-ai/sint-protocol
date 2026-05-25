# PX4 Log Encryption -> SINT Evidence Integration

This guide defines the minimum integration flow to use encrypted PX4 logs as
supporting evidence for SINT-governed physical actions.

## Why this lane matters

SINT already records policy decisions and approvals. PX4 encrypted logs add a
second, independently generated telemetry trail for flight behavior. Together,
they strengthen incident replay and external auditability.

## Minimum flow

1. Execute governed flight actions through SINT (MAVLink bridge path).
2. Download encrypted PX4 logs (`.ulge`).
3. Decrypt logs in a controlled review environment (never on runtime nodes).
4. Correlate:
   - SINT `requestId`, decision tier, and policy event timestamps
   - PX4 ULog event windows (arming, mode switches, setpoints, failsafes)
5. Emit a review artifact with:
   - evidence hash of decrypted log bundle
   - log key identifier reference (not private key material)
   - timeline match results and anomaly notes

Use this template:

- `docs/reports/px4-ulog-correlation-artifact.template.json`

## Security posture

- Keep log decryption private keys in separate key-management scope.
- Do not store decrypted raw logs in long-lived hot paths.
- Store only evidence digests and bounded references in SINT-facing artifacts.

## Suggested first implementation tasks

1. Add a conformance fixture that requires ULog-correlation evidence for
   offboard T2/T3 scenarios.
2. Add a bridge payload extension for `px4LogEvidenceRef`:
   - `logDigest`
   - `keyRef`
   - `timeWindow`
3. Add an operator runbook section for review-time decryption workflow.
4. Add one benchmark metric:
   - decision-to-flight-event correlation latency.

## Minimal acceptance checks

- every reviewed T2/T3 offboard action has one correlation artifact
- artifact includes both encrypted and decrypted log digests
- artifact includes a non-secret `keyRef`, never key material
- at least one MAVLink action timestamp is correlated within the declared
  `maxAllowedDeltaMs`

## Non-goals

- Modifying PX4 flight-control internals.
- Introducing private key material into SINT runtime services.
- Claiming hardware or regulatory certification by this integration alone.
