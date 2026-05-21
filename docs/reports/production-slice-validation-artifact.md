# Production Slice Validation Artifact

Generated: 2026-05-21T20:24:34.882Z
Commit: 8ea166983f2ba14859e09f0f59c09d16342e82fd
Result: PASS

## Scope

- Surface: `apps/gateway-server` production slice
- Test: `__tests__/production-slice.test.ts`
- Contract: issue token, intercept request, persist evidence, prove ledger chain, revoke token, fail closed

## Redaction Boundary

- Included: test status, timing, assertion names, git SHA, timestamp
- Excluded: token values, key material used in test execution, environment-specific endpoint details

## Summary

- Suites: 1/1 passed
- Tests: 1/1 passed

## Signature

- Algorithm: ed25519
- Payload hash (sha256): `fa0038b7dcf15abc05a647e25b73d18b2666950b48d5760634a4b37a831bb193`
- Verification key fingerprint (sha256): `4f23796b0669c147c57043c0092f44b00f68ed12812a2cbf95eefb0c2cb1b3dd`
- Key scope: report-local-ephemeral

## Suite Detail

| Suite | Status | Duration (ms) | Passed | Failed |
|---|---:|---:|---:|---:|
| apps/gateway-server/__tests__/production-slice.test.ts | passed | 56.99658203125 | 1 | 0 |
