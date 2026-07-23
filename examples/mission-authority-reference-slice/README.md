# Mission Authority Reference Slice

This example is the smallest public, synthetic Mission Authority deployment path:

1. register a signed mission manifest in an in-memory authority store;
2. evaluate a proposed platform action with two operator approvals;
3. claim the `actionRef` once before execution;
4. create a signed effect pack and short-lived dispatch envelope;
5. run the effect through `@pshkv/sint-edge-agent`;
6. finalize the terminal outcome.

It deliberately uses an injected executor and synthetic identities. It does not
talk to a robot, shell, exchange, or customer system.

Run:

```bash
pnpm run build
pnpm run demo:mission-authority-reference
```

The matching conformance test is:

```bash
pnpm --filter @pshkv/conformance-tests exec vitest run src/mission-authority-reference-slice-conformance.test.ts
```
