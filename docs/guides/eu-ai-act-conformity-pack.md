# EU AI Act Conformity Pack

This guide defines the first SINT conformity package for physical AI and
humanoid robotics deployments selling into or operating inside the EU.

It is an evidence pack, not a legal opinion or product certificate. Its job is
to turn SINT's existing token, gateway, approval, rollback, and ledger artifacts
into reviewer-ready material for provider, deployer, notified-body, and
independent safety-review workflows.

Official anchors:

- [Article 13: Transparency and provision of information to deployers](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-13)
- [Article 14: Human oversight](https://ai-act-service-desk.ec.europa.eu/en/ai-act/article-14)
- [Annex IV: Technical documentation referred to in Article 11(1)](https://www.springlex.eu/en/packages/ai-act/ai-act-regulation/annex-4/)

The executable fixture is
`packages/conformance-tests/fixtures/compliance/eu-ai-act-conformity-pack.v1.json`.
The conformance test is
`packages/conformance-tests/src/eu-ai-act-conformity-pack-conformance.test.ts`.

## Scope

The first target deployment is a SINT-governed warehouse humanoid fleet:

- humanoid robots and AMRs in shared workspaces
- ROS 2, Open-RMF, OPC UA, MQTT/Sparkplug, and MCP control surfaces
- T2 physical actions reviewed before actuation
- T3 safety-envelope, emergency-stop, and irreversible actions captured with
  high-consequence evidence
- per-shift JSON Lines evidence export from the append-only EvidenceLedger

The pack deliberately avoids claiming certified compliance. It gives reviewers
a structured way to inspect the controls SINT can prove.

## Article 13 Export

The transparency export contains:

- system name and intended purpose
- deployer/operator role
- resource catalog for `humanoid://` actions and approval tiers
- approval-tier model: T0 observe, T1 prepare, T2 act, T3 commit
- known limitations
- human oversight measures
- log access procedure
- evidence references generated from conformance fixtures

The key rule is that examples must come from fixture data, not hand-written
claims. For humanoids, the export includes representative rows for navigation,
handoff, and emergency-stop evidence from the warehouse pilot fixture.

## Article 14 Export

The human-oversight export contains:

- oversight role
- intervention points for T2 and T3 requests
- stop-control description
- T2/T3 approval, denial, incident, and rollback evidence
- operator-training artifact reference
- post-incident review artifact reference

For physical AI, the most important reviewer question is whether a human can
intervene before high-impact behavior occurs. In SINT, that is represented by
the gateway approval queue for T2/T3 actions, unconditional e-stop handling, and
hash-chained evidence after resolution.

## Annex IV Checklist

The checklist maps reviewer questions to repository artifacts:

| Annex IV area | SINT evidence |
| --- | --- |
| System description | humanoid warehouse pilot guide and humanoid profile fixture |
| System components | tier rules and physical-AI fixture contracts |
| Risk management | `PolicyGateway.intercept()` tests and denial/escalation evidence |
| Human oversight | Article 14 export fixture and conformance test |
| Logging and traceability | EvidenceLedger and per-shift export guide |
| Cybersecurity | capability tokens and crypto-agility roadmap |

Every checklist row must point to a concrete artifact path. This keeps the pack
useful for external review and prevents compliance claims from floating away
from implementation.

## ISO 13482 Crosswalk

For service robots operating near humans, the initial ISO 13482-oriented
crosswalk covers:

- protective stop: unconditional e-stop event and rollback evidence
- speed and separation monitoring: token-bound velocity plus dynamic envelopes
- force limiting: token-bound max-force constraints
- human presence: `humanDetected` context for escalation or deny decisions

This is a crosswalk for safety-review support. Hardware safety certification,
motion-controller validation, and site-level risk classification still require
qualified external assessment.

## Reviewer Procedure

1. Run `pnpm --filter @pshkv/conformance-tests test -- src/eu-ai-act-conformity-pack-conformance.test.ts`.
2. Run `pnpm --filter @pshkv/conformance-tests test:fixtures`.
3. Export the per-shift warehouse pilot JSON Lines evidence.
4. Verify the EvidenceLedger SHA-256 chain.
5. Review Article 13, Article 14, Annex IV, and ISO 13482 rows against the
   deployment's actual robot, site, and safety-controller configuration.

## Exit Criteria

- Article 13 transparency export is generated from fixture data.
- Article 14 export includes T2/T3 review evidence.
- Annex IV checklist rows reference concrete SINT artifacts.
- ISO 13482 crosswalk is present for service-robot safety review.
- An external reviewer can validate usability without relying on maintainer
  assertions.
