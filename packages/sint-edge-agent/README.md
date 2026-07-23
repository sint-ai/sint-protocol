# SINT Edge Agent

`@pshkv/sint-edge-agent` verifies a centrally authorized action again at the
execution boundary. It does not replace `PolicyGateway.intercept()` and cannot
approve an action.

The package introduces two independent SINT contracts:

- **Effect packs**: signed, content-addressed declarations of effects,
  resources, parameter bounds, minimum tiers, execution limits, and redaction.
- **Dispatch envelopes**: short-lived, runner-bound, single-use authorization
  artifacts that bind a capability token, policy evidence, approval evidence,
  effect-pack digest, parameters, and physical context.

Before invoking an injected executor, the runner verifies:

1. Pack structure, digest, signature, trust, and expiry.
2. Dispatch structure, signature, signer trust, expiry, runner binding, and
   replay status.
3. Local allow/deny policy and tier ceiling.
4. Required approval evidence for configured strong tiers.
5. Capability signature, expiry, scope, and physical constraints.
6. Typed parameter contracts with additional parameters denied by default.

Signed physical bindings map effect parameters directly to capability checks
such as commanded velocity and force. A dispatch cannot weaken those checks by
supplying a different physical-context value.

Execution output is redacted and byte-limited before it leaves the runner. Each
accepted, denied, started, and terminal state is appended to a local SHA-256
hash-chained journal.

Hardware integration is supplied as an `EffectExecutor`; the package does not
construct shell commands or grant ambient host authority.
