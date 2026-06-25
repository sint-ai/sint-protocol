# Mission Authority Reference Gateway Path

This guide is the default public reference path for evaluating Mission
Authority without customer data, controlled technical data, or live hardware.

It proves the control boundary that a production deployment must preserve:

1. mission authority is evaluated before a proposed platform action executes;
2. capability-token enforcement remains separate and still gates the dispatch;
3. edge execution can only narrow authority;
4. action claims and outcomes are append-only;
5. evidence is generated from synthetic inputs that can be shared publicly.

## Reference Slice

Run the synthetic reference slice:

```bash
pnpm run build
pnpm run demo:mission-authority-reference
```

The script lives at:

- `examples/mission-authority-reference-slice.mjs`
- `examples/mission-authority-reference-slice/README.md`

It uses in-memory stores and injected executors only. A successful run registers
a signed manifest, observes operator quorum, reserves one `actionRef`, creates a
signed effect-pack dispatch, runs the edge verifier, and finalizes a terminal
outcome.

## Readiness Gates

A deployment is not ready to pilot until it can show all of these gates:

| Gate | Evidence |
|---|---|
| Signed authority | Mission manifest policy hash and issuer signature verify before storage |
| Operator quorum | T2/T3 or effect-bearing actions require fresh authorized operator approvals |
| Gateway separation | Capability-token policy and Mission Authority must both allow execution |
| Append-only execution | `actionRef` is claimed once and terminal outcome is finalized once |
| Edge revalidation | Signed Effect Pack runner verifies pack, dispatch, token, parameters, and local policy |
| Evidence replay | Journal, receipt, and terminal outcome hashes are reproducible from synthetic inputs |
| Revocation drill | Expired, revoked, wrong-platform, disconnected, and compromised proposals fail closed |
| Public-data boundary | Demo data uses synthetic identities and no customer mission records |

The machine-readable checklist is:

- `packages/conformance-tests/fixtures/mission-authority/reference-gateway-readiness.v1.json`

The conformance guard is:

```bash
pnpm --filter @pshkv/conformance-tests exec vitest run src/mission-authority-reference-gateway-conformance.test.ts
```

The release-lane evidence gate is:

```bash
pnpm run mission-authority:release-lane
```

It binds this guide, the reference slice, the readiness fixture, and the
expected GitHub checks into one conformance-checked release contract.

## Durable Production Shape

The reference slice uses in-memory stores so it is safe to run anywhere. The
production shape replaces only storage and signing backends:

| Reference component | Production replacement |
|---|---|
| `InMemoryMissionManifestStore` | PostgreSQL mission manifest migrations |
| in-process capability token issuance | deployment key service or HSM-backed issuer |
| injected synthetic executor | hardware adapter owned by the deployment |
| local edge journal | platform local journal plus exported evidence bundle |
| generated test keypairs | platform and operator identities from the deployment trust root |

The invariant does not change: every physical effect still requires both the
central SINT policy decision and local edge admission. The edge runner may deny a
centrally authorized dispatch, but it never upgrades an escalation or denial.

## Pilot Acceptance Run

A design partner or internal pilot should record one synthetic run for each case:

- valid execution;
- wrong platform denial (`wrong-platform`);
- expired manifest denial (`expired-manifest`);
- revoked authority denial (`revoked-authority`);
- communications-loss safe response (`communications-loss`);
- autonomy-compromised safe response (`autonomy-compromised`);
- missing operator quorum escalation (`missing-operator-quorum`);
- replayed `actionRef` denial (`action-ref-replay`);
- replayed dispatch denial (`dispatch-replay`);
- edge physical-limit denial (`edge-physical-limit`).

Keep the public artifact synthetic. Real mission parameters, customer site maps,
operator rosters, and controlled integration details belong in access-controlled
repositories.
