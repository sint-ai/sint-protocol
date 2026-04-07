# EU AI Act Mapping for SINT Agentic Systems

Status: Published (Q3 roadmap artifact)
Last updated: 2026-04-05

## Scope

This document maps SINT protocol/runtime controls to EU AI Act obligations relevant to high-risk and safety-critical agentic systems operating in physical environments.

## Mapping Summary

| EU AI Act Area | SINT Control Surface | Evidence Path |
|---|---|---|
| Risk management lifecycle | Tiered policy gateway (`T0`-`T3`), escalation logic, fail-closed revocation | Gateway decisions + ledger events |
| Data and governance expectations | Schema-validated requests/tokens, explicit constraints envelopes | `/v1/schemas`, decision payloads |
| Technical documentation | Versioned specs + public docs site + profile templates | `docs/`, `/.well-known/sint.json` |
| Record-keeping and traceability | Hash-chained evidence ledger with proof routes | `/v1/ledger`, `/v1/ledger/:eventId/proof` |
| Transparency to operators | Dashboard approvals, policy playground, operator interface tooling | Dashboard logs + approval history |
| Human oversight | Approval tiers/quorum, human-in-the-loop for T2/T3 actions | Approval event stream + resolve records |
| Accuracy/robustness/cybersecurity | Conformance fixtures, industrial equivalence tests, revocation/load scenarios | `packages/conformance-tests` reports |

## Operational Interpretation for SINT Deployments

1. Treat every physical-action bridge route as potentially high-impact and enforce tier controls.
2. Require documented deployment profiles (`warehouse-amr`, `industrial-cell`, `edge-gateway`) for production.
3. Keep audit retention and proof verification procedures in site SOPs.
4. Demonstrate human-oversight routes for escalated actions during acceptance testing.

## Minimum Compliance Packet for Buyers

- Protocol discovery doc and schema catalog
- Deployment profile policy templates
- Conformance test evidence for deployed bridge paths
- Incident/revocation drill logs
- Monthly security bulletin archive

## Caveat

This mapping is implementation guidance for engineering and procurement conversations. It is not legal advice; organizations must validate obligations with counsel for their sector and jurisdiction.
