# Emergency Bypass Protocol (Safety-Critical Override)

This guide documents the emergency override baseline in `@pshkv/gate-policy-gateway`.

## What it provides

- Time-bounded emergency bypass tokens
- Trigger-reason tagging (`medical`, `fire`, `security`, `fall`)
- Hard cap on emergency window duration (default max: 1 hour)
- Mandatory post-hoc audit entry with deterministic SHA-256 hash

## Usage outline

1. Construct `EmergencyBypassProtocol`.
2. Call `bypassTier(action, justification)` during an active emergency.
3. Persist `logEmergencyBypass(token)` output in your evidence/audit sink.

## Operational notes

- Emergency context windows are always bounded; requested durations above the configured cap are clamped.
- Audit entries are deterministic for the same bypass metadata to simplify downstream verification.
- This path is intended for fail-safe operations and should be restricted to trusted operators.
