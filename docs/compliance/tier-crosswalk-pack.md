# SINT Tier Crosswalk Pack

This pack maps SINT approval tiers to control intents in:
- NIST AI RMF 1.0
- ISO/IEC 42001:2023
- EU AI Act (Regulation (EU) 2024/1689)

## Scope

This is implementation guidance for agentic/robotic systems using SINT as a control-plane layer.
It is not legal advice.

## Tier Mapping

| SINT Tier | NIST AI RMF | ISO/IEC 42001 | EU AI Act |
|---|---|---|---|
| `T0_OBSERVE` | Govern + Measure baseline telemetry and traceability | Monitoring controls and logging practices | Technical documentation and traceability support |
| `T1_PREPARE` | Manage pre-actuation controls and safe defaults | Change management and operational controls | Risk-management process and logging continuity |
| `T2_ACT` | Human oversight + risk treatment for consequential operations | Operational safeguards with accountable approvals | Human oversight and risk controls for high-risk operations |
| `T3_COMMIT` | Highest-governance path, strict oversight, emergency response readiness | Strict approval, incident response, and audit evidence | Human oversight, post-market monitoring, and serious-incident accountability |

## Agentic Systems Interpretation

- Tool calls with real-world consequence should not remain in `T0`/`T1` when context indicates physical/financial irreversibility.
- `T2` and `T3` paths should produce evidence events with operator identity and timestamp.
- Revocation and stale-approval fail-closed behavior are required for control credibility.

## Evidence Expectations

For compliance-facing deployments, retain:
- policy decision events (`allow/deny/escalate/transform`)
- approval resolution records (who/when/why)
- token issuance/revocation lineage
- backend readiness and incident timeline evidence
