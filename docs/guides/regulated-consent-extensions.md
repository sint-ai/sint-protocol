# Regulated Consent Extensions

This guide defines the H6 experimental consent and regulated-domain evidence
pack for physical AI.

It is deliberately conservative. SINT can prove who authorized a high-risk
robot action, when consent was revoked, and which token was used without storing
raw audio, raw video, or biometric templates. It does not certify HIPAA, FDA,
CPSC, medical-device, or consumer-product compliance.

The executable fixture is
`packages/conformance-tests/fixtures/compliance/regulated-consent-extensions.v1.json`.
The conformance test is
`packages/conformance-tests/src/regulated-consent-extensions-conformance.test.ts`.

## Consent Event Schema

Every consent event must include:

- consent id
- grantor reference
- subject role
- scope
- token id
- resource
- action
- modalities
- evidence digest
- raw-evidence storage flag
- expiry
- revocability flag

Allowed modalities:

- voice
- gesture
- touch
- app
- caregiver delegation

The evidence digest is a SHA-256 digest over the local consent artifact. The raw
artifact should remain on-device or inside the deployment's regulated data
system.

## Consent Scopes

The initial scopes cover:

- patient-to-caregiver vitals read
- worker consent for shared-zone robot assist
- resident consent for room entry

Every scope is:

- token-bound
- time-bounded
- revocable
- scoped to a resource pattern and explicit actions

## Privacy Rules

SINT evidence should prove authorization without becoming a sensitive-data
warehouse.

| Sensor | Allowed evidence | Forbidden evidence |
| --- | --- | --- |
| Camera | presence booleans, gesture digest, device attestation | raw frames, face embeddings, identity labels |
| Microphone | intent digest, local transcript hash, device attestation | raw audio, voiceprints, speaker identification |
| Biometric | consent status, revocation ref, policy decision ref | biometric template, remote ID result, emotion inference |

## Incident Exports

The first prototypes are:

- consumer room-entry incident
- caregiver access review

Both are marked experimental. They carry consent ids, token ids, decisions,
policy violations, evidence digests, and ledger hashes. They do not carry raw
media or biometric templates.

## Verification

Run:

```bash
pnpm --filter @pshkv/conformance-tests test -- src/regulated-consent-extensions-conformance.test.ts
pnpm --filter @pshkv/conformance-tests test:fixtures
```

## Exit Criteria

- Consent evidence is token-bound and revocable.
- SINT can prove who authorized a high-risk robot action without storing more
  personal data than required.
- Medical, home, and consumer modules remain experimental until partner
  validation exists.
