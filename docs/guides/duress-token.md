# Duress Token Pattern

The duress-token module in `@pshkv/gate-capability-tokens` provides a
survivor-centered control pattern for high-risk domestic safety contexts.

## What it adds

- Split control metadata: survivor identity + trusted third-party identity
- Dual-approval validation for sensitive resolution paths
- Evidence escrow metadata for judicially controlled access
- Coercion signal detection from access-log patterns

## Core API

- `createDuressCapabilityToken(baseToken, profile, escrow)`
- `validateDuressResolution(token, approvers)`
- `detectCoercion(logs, options)`

## Operational guidance

- Issue duress tokens only from revocable base capabilities.
- Require dual approval for irreversible actions (for example, disabling alarms or revoking active safe-access tokens).
- Persist coercion-detection reasons alongside audit records for post-incident review.
