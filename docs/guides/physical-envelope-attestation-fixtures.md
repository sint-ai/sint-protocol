# Physical Envelope Attestation Fixtures

Status: v0.1 shared research artifact

This fixture pack tests the transition from deployment evidence to an active
physical envelope and then to execution authorization. It was created from the
SINT and DriftCore external review documented in the
[collaboration roadmap](../community/driftcore-sint-collaboration-roadmap.md).

The fixture separates two consequences that belong to different layers:

- a deployment envelope controller must make the tighter fallback physically
  active when permissive evidence is lost;
- an authorization gateway must refuse execution when it cannot establish the
  active envelope or when its decision is bound to different evidence.

A SINT denial is therefore not presented as physical demotion. Firmware, a PLC,
a motor controller, or another independently enforced deployment layer owns the
physical transition. SINT owns whether the attempted action may cross its
execution boundary.

## Files

- `packages/conformance-tests/fixtures/physical-ai/envelope-attestation-fixtures.v0.1.json`
- `packages/conformance-tests/fixtures/physical-ai/envelope-attestation-fixture.schema.json`
- `packages/conformance-tests/src/envelope-attestation-fixtures-conformance.test.ts`

## Required outcomes

The positive control requires fresh, correctly scoped, verified TRUE evidence
to activate the already-authorized `working` envelope. The execution decision
must bind the exact evidence-set digest. An implementation that rejects every
case fails this control.

The negative vectors require the `transport` fallback and denial for:

- a newer FALSE reading, in either input order;
- expired or unauthenticated evidence;
- verifier outage;
- non-finite TTL;
- conflicting values at the same source and sequence;
- disagreement between trusted sources without a declared quorum policy;
- evidence replayed from an earlier boot epoch.

Valid evidence can still activate an envelope while execution is denied when
the authorization references a different evidence-set digest. This isolates
state eligibility from request-specific authorization binding.

## SINT findings captured by the fixture

The review also found two analogous issues in SINT's gateway:

1. caller-supplied `hardwareSafety` context took precedence over a configured
   PLC or OPC-UA safety-permit resolver;
2. a dynamic-envelope resolver failure fell back to the token's wider static
   limits for physical actions.

The accompanying gateway changes make an external permit result authoritative
and deny T2/T3 execution when either external safety verification path fails.
T0/T1 observation remains available during an outage.

## Running the SINT runner

```bash
pnpm --filter @pshkv/conformance-tests exec vitest run \
  src/envelope-attestation-fixtures-conformance.test.ts
```

Other projects can consume the JSON without importing SINT code. A conforming
runner must reproduce the declared state and execution outcomes and document
how it authenticates proof material, persists replay state, and applies the
physical fallback.
