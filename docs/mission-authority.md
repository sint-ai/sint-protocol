# SINT Mission Authority

SINT Mission Authority is the independent runtime authority and evidence layer
for autonomous systems. It answers a narrow question before an externally
proposed action executes:

> Is this platform authorized to perform this action, under this signed mission,
> with the required operator authority and abort behavior?

SINT does not select targets, generate effects, plan engagements, or recommend
the use of force.

## Product Components

### Mission Envelope Protocol

`MissionManifest` binds authority to a platform identity, mission class, validity
window, resources, actions, geographic bounds, effect constraints, approval
policy, abort conditions, and delegation depth.

`policyHash` is SHA-256 over the canonical manifest with `policyHash` and
`signature` omitted. Registration recomputes this commitment before verifying
the issuer signature, so a signed but falsely declared policy hash is rejected.

Delegated manifests are attenuation-only. They cannot change mission class,
change platform, extend time, add resources or actions, add effects, weaken
quorum, change issuer identity, reuse or lower the manifest version, or increase
delegation depth. Registration
requires the complete ancestor chain to exist, remain unrevoked, and pass the
complete attenuation check before the child is persisted. Revoking any ancestor
immediately invalidates all descendants at evaluation time without mutating
their signed manifests.

Each platform identity also has an atomic authority high-water mark. After the
first root is registered, every update must be a higher-version direct child of
the current head. Concurrent forks, version rollback, and execution under a
superseded manifest fail closed. PostgreSQL stores the head separately from the
immutable manifests so authority history remains append-only.

### Edge Authority

The Rust crate at `sdks/rust/sint-edge-authority` evaluates manifests and action
proposals without network access. Deployments provide signature verification
through `ManifestVerifier` and hardware-backed evidence signing through
`HardwareSigner`.

The execution path consumes local inputs:

- signed mission manifest;
- externally proposed action;
- cached revocation state;
- operator authorizations;
- communications and autonomy-supervisor state;
- local effect-use count.

At the gateway, an executable decision is finalized through an atomic,
append-only action claim. `actionRef` can be claimed only once, and effect-use
ceilings are checked in the same persistence operation. Callers cannot provide
or reset the authoritative use count.

After execution, the platform submits a signed terminal outcome. The gateway
accepts exactly one `completed`, `failed`, or `aborted` report for an existing
claim, verifies it against the manifest platform identity, and appends a
completion event linked to the original gate receipt.

### Evidence Black Box

`MissionEvidenceBundle` binds the authority decision to operator approvals,
sensor provenance, software and manifest versions, gate and completion receipts,
execution outcome, and the previous bundle hash. The evidence-ledger package
builds and verifies signed bundles.

### Mission Assurance Console

The existing SINT operator interface remains the console foundation. Product
work should expose manifests, platform authority state, pending approvals,
revocation, abort status, evidence replay, and after-action export. Customer and
export-controlled integrations must live in access-controlled repositories, not
in this public protocol repository.

## Safety Rules

- Every platform action still passes through `PolicyGateway.intercept()`.
- Mission Authority is an additional authority check, never a bypass.
- Kinetic effect declarations require operator authorization and quorum.
- An explicit operator denial always wins.
- Expiry, revocation, compromised autonomy, and configured communications loss
  fail closed.
- E-stop remains immediate and unconditional.
- SINT evaluates externally supplied effect requests; it never creates them.

## Verification

```bash
pnpm --filter @pshkv/core test -- mission-authority.test.ts
pnpm --filter @pshkv/gate-evidence-ledger test -- mission-evidence-bundle.test.ts
pnpm --filter @pshkv/conformance-tests test -- mission-authority-conformance.test.ts
pnpm --filter @pshkv/conformance-tests exec vitest run src/mission-authority-reference-slice-conformance.test.ts
cd sdks/rust && cargo test -p sint-edge-authority
pnpm run security:sbom
```

## Reference Slice

The public synthetic reference path is:

- `examples/mission-authority-reference-slice.mjs`
- `examples/mission-authority-reference-slice/README.md`
- `docs/guides/mission-authority-reference-gateway.md`

It runs a signed manifest, operator quorum, append-only action claim,
short-lived dispatch envelope, edge-runner journal, and terminal outcome without
touching real hardware:

```bash
pnpm run build
pnpm run demo:mission-authority-reference
pnpm run mission-authority:readiness
pnpm run mission-authority:release-lane
```
