# SINT PDP Interceptor Quickstart

This is the fastest way to understand the flagship interceptor work from issue #128 without digging through packages or tests.

In one terminal run, you will see:

- an MCP-style request enter `@pshkv/sint-pdp-interceptor`
- a SINT gateway decision for an allowed operation
- a proof receipt generated for the audited decision path
- an escalated operation that does not execute downstream work
- a fail-closed denial when a gate prerequisite is missing

## Run it

```bash
pnpm install
pnpm run build
pnpm run demo:interceptor-quickstart
```

The demo entrypoint lives in the repo at [`examples/sint-pdp-interceptor-quickstart.mjs`](https://github.com/sint-ai/sint-protocol/blob/main/examples/sint-pdp-interceptor-quickstart.mjs).

## What the demo covers

### 1. Allow path with receipt

The demo sends a `filesystem.writeFile` style request through the interceptor, gets an `allow` decision, and then generates a proof receipt for the resulting `policy.evaluated` ledger event.

That gives one compact flow:

`request -> decision -> receipt`

### 2. Escalation path

The demo then sends a destructive `filesystem.deleteFile` style request. The gateway responds with `escalate`, and the guarded helper does not run downstream execution.

This is the important behavior for launch messaging: the interceptor does not just classify risk, it blocks irreversible work until an approval path exists.

### 3. Fail-closed path

Finally, the demo shows an actuator-style command with a missing verified gate prerequisite. `runGuarded()` converts that into a deny decision with `policyViolated = "GATE_PREREQUISITE_MISSING"` before any side effect occurs.

## Example transcript

The exact hashes and signatures will vary, but the structure should look like this:

```text
SINT PDP Interceptor — 5 minute quickstart
Command: pnpm run build && pnpm run demo:interceptor-quickstart

=== 1. Allow path with receipt ===
Request
{ ...filesystem write request... }

Decision
{ "action": "allow", "assignedTier": "T1_prepare", ... }

Receipt
{ "eventId": "...", "eventHash": "...", "hashChainLength": 2, "verified": true }

=== 2. Escalation path ===
Escalation decision
{ "action": "escalate", "assignedTier": "T3_commit", ... }
Executed downstream work: no

=== 3. Fail-closed missing prerequisite ===
Blocked decision
{ "action": "deny", "denial": { "policyViolated": "GATE_PREREQUISITE_MISSING", ... } }
Final stage: blocked
Outcome: the interceptor denied execution before any downstream side effect.
```

## Where to look next

- Package README: [`packages/sint-pdp-interceptor/README.md`](https://github.com/sint-ai/sint-protocol/blob/main/packages/sint-pdp-interceptor/README.md)
- Source: [`packages/sint-pdp-interceptor/src/interceptor.ts`](https://github.com/sint-ai/sint-protocol/blob/main/packages/sint-pdp-interceptor/src/interceptor.ts)
- Tests: [`packages/sint-pdp-interceptor/__tests__/interceptor.test.ts`](https://github.com/sint-ai/sint-protocol/blob/main/packages/sint-pdp-interceptor/__tests__/interceptor.test.ts)
- Bilateral receipts: [`packages/evidence-ledger/src/proof-receipt.ts`](https://github.com/sint-ai/sint-protocol/blob/main/packages/evidence-ledger/src/proof-receipt.ts)
