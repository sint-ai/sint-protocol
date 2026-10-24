# Authenticated deployment and factory evidence

`PolicyGateway.intercept()` remains the authorization entry point. The default
deployment and manufacturing policies require authenticated evidence whenever a
token requires deployment proof or a passing inspection.

Configure `resolveDeploymentEvidence(evidenceType, evidenceRef)` to return a
`Result<DeploymentEvidenceRef, { message: string }>` from an operator-controlled
attestor or evidence store. The resolver must verify signatures and signer trust
when it reads signed attestations. The gateway compares the authenticated
reference, proof hash, verifier, and observation timestamp with the submitted
metadata, enforces token-pinned values, and rechecks freshness after lookup.
Copying known hashes and supplying a new timestamp cannot refresh an attestation.
An absent resolver or record denies the request.

Configure `resolveInspectionReceipt(reference)` to return a
`Result<InspectionReceipt, { message: string }>` from a trusted quality system.
Inline receipts must match that record in full. Reference-only requests use the
resolved receipt; caller-provided passing status does not satisfy the gate.
The gateway checks part/revision and inspection-plan binding, passing disposition,
calibration state and expiry, inspection time, feature tolerance flags, and
numeric deviations from nominal dimensions. Resolver errors and timeouts deny
and appear in the gateway's plugin-failure audit.

Both resolvers may return promises. They are trusted deployment dependencies:
never implement either by copying fields from the agent request. Existing
deployments that use evidence-gated tokens must configure these lookups before
upgrading. Tokens without evidence requirements do not require a resolver.

The execution broker serializes sequence validation, nonce consumption, dispatch,
and stream-state updates per VLA stream within one broker instance. It rechecks
deadlines after queueing and nonce consumption. Deployments with multiple broker
instances must route each stream to one owner; the in-memory sequence tracker
does not provide distributed coordination.

Customer-safe trace exports filter authority, approval, and nested approval
references from artifact lists. Fully redacted exports also remove inspection,
nonconformance, and rework artifacts. Export redaction constructs a new bundle;
source evidence remains immutable.

PostgreSQL deployments must apply `008_predictive_policy_fields.sql` (or run
the schema bootstrap) before persisting tokens from this branch. The store
retains deployment, manufacturing, hazardous-energy and adaptation policies in
both read paths and signed replacements. Missing policy fields are never
inferred for existing rows; signatures remain the integrity check.

Verification:

```sh
pnpm run verify
pnpm run cert:fixtures
pnpm --filter @pshkv/execution-broker test
pnpm --filter @pshkv/gate-evidence-ledger exec vitest run __tests__/factory-trace-bundle.test.ts
```
