# Continuous Effect Lifecycle Interop Fixture

`continuous-effect-lifecycle.v1.json` is a proposal fixture for a narrow
physical-action lifecycle: a capability admits a continuous actuator effect,
the runtime renews it against current live state, and expiry, revocation, or a
stop signal suspends or rolls it back safely.

The fixture intentionally leaves the vocabulary at `proposal` status. It is
not an adoption claim. Two independent implementations must pass the fixture
without implementation-specific exceptions before the terms are described as
interoperable or adopted.

The reference checks preserve SINT's existing boundaries:

- admission and renewal call `PolicyGateway.intercept()`;
- physical limits remain in the signed capability token and are checked again
  using live context;
- expiry and revocation fail closed;
- stop behavior emits rollback evidence and marks the effect inactive;
- evidence is modeled as append-only receipts with only the minimum fields
  needed to correlate the decision and safe-stop outcome.

The reference gateway also exposes `ContinuousEffectCoordinator` for lease
bookkeeping. It does not authorize independently: admission and every renewal
call `PolicyGateway.intercept()`, while expiry or denial invokes the configured
safe-stop callback.

Run the reference check with:

```bash
pnpm --filter @pshkv/conformance-tests test src/continuous-effect-lifecycle-conformance.test.ts
```
