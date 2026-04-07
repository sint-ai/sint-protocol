# AgentSkill Authorization Interop Fixtures

This guide defines how external runtimes can execute the canonical AgentSkill delegated-authority fixture set and compare results with SINT.

## Purpose

The fixture pack turns delegated-authority semantics into executable checks at the `AgentSkill` boundary:

- subject-bound token + scope match
- scope mismatch denial
- revocation and expiry TOCTOU fail-closed behavior
- tier-gated attestation requirement enforcement

Fixture file:

- `packages/conformance-tests/fixtures/interop/agentskill-delegated-authority.v1.json`

## Input Contract

Each scenario provides:

- `tokenTemplate` plus optional `tokenOverrides`
- request tuple: `resource`, `action`, optional `params`, optional `executionContext`
- optional lifecycle mutation:
  - `revokeBeforeIntercept`
  - `mutateTokenExpiryTo`

## Expected Output Contract

Runtimes should emit and compare at minimum:

- `decisionAction` (`allow|deny|escalate|transform`)
- `assignedTier` when applicable
- `policyViolated` for denial paths

## Run Locally

From repository root:

```bash
pnpm --filter @sint/conformance-tests test:fixtures
```

Or run only this fixture test:

```bash
pnpm --filter @sint/conformance-tests test src/agentskill-authz-fixtures-conformance.test.ts
```

## Cross-Runtime Validation

For side-by-side interop checks:

1. Load the fixture JSON unchanged.
2. Map token and request fields into your runtime gateway boundary.
3. Execute scenarios in order.
4. Compare only contract fields (`decisionAction`, `assignedTier`, `policyViolated`), not internal engine state.

This keeps policy internals implementation-specific while preserving externally verifiable behavior.
