# Regulated Agent Runtime Profile v1

Status: Experimental

This profile defines SINT runtime controls for AI agents that touch regulated
data, downstream tools, model calls, processors, and external services. It is a
runtime governance and evidence profile only. It is not legal, medical, privacy,
or regulatory compliance certification.

The executable fixture is
`packages/conformance-tests/fixtures/compliance/regulated-agent-runtime.v1.json`.
The conformance test is
`packages/conformance-tests/src/regulated-agent-runtime-conformance.test.ts`.

## Goal

SINT already governs physical actions through scoped capability tokens,
`PolicyGateway.intercept()`, approval tiers, and append-only evidence. This
profile applies the same pattern to regulated data workflows:

- discover the governed runtime surface
- bind purpose, consent, processor, model, and region before execution
- attenuate downstream context for sub-agents
- deny unsafe processor or region paths
- transform requests through redaction, minimization, or approved fallback
- record receipts without storing raw sensitive payloads in the ledger

## Runtime Surfaces

The governed surface includes:

- agents
- sub-agents
- models
- APIs
- MCP tools
- internal systems
- external services
- regulated data stores

Every governed request from these surfaces must enter
`PolicyGateway.intercept()` before execution. Bridges and route handlers may map
protocol-specific input into SINT requests, but they must not make authorization
decisions directly.

## Data Classes

The initial fixture defines three data classes:

| Class | Default tier | Consent required | Examples |
| --- | --- | --- | --- |
| `PHI` | `T2_ACT` | Yes | treatment notes, diagnostic reports, medication requests |
| `PII` | `T1_PREPARE` | Yes | names, birth dates, insurance member ids |
| `ADMIN` | `T0_OBSERVE` | No | appointment slots, billing status, workflow state |

Deployments may add stricter local classes. They must not weaken the fixture
rules for sensitive payload minimization.

## Policy Checks

For regulated data requests, SINT implementations should evaluate at least:

- resource and action scope
- token expiration and revocation
- purpose of use
- data classes requested
- approved processor list
- approved model list
- approved region or residency boundary
- delegated context scope
- fallback route safety

These checks are token-bound. Configuration may provide deployment defaults, but
the effective authority must come from the signed capability token and any valid
attenuated delegation chain.

## Context Attenuation

Downstream agents inherit less authority than their parent, never more. If a
billing, scheduling, analytics, or support sub-agent requests fields outside its
delegated scope, the gateway must deny or transform the request.

The preferred transform is context minimization:

- remove fields outside the delegated context
- preserve only the minimum necessary fields
- record the requested fields and effective fields in evidence
- avoid recording raw sensitive values

This is the data-workflow counterpart to SINT's token attenuation invariant.

## Transform Decisions

The profile treats transform decisions as first-class policy outcomes.

Supported transform reasons include:

- `minimize_context`
- `remove_treatment_notes`
- `redact_direct_identifiers`
- `route_to_approved_region`
- `route_to_approved_model`

Transform receipts should explain what changed and why. They should include
digests and metadata, not raw sensitive records.

## Required Evidence

Receipts for this profile should include:

- `requestId`
- `tokenId`
- `resource`
- `action`
- `decision`
- `assignedTier`
- `purposeOfUse`
- `processor`
- `model`
- `region`
- `evidenceDigest`

When context is delegated, receipts should also include:

- `delegatedFrom`
- `requestedContextFields`
- `effectiveContextFields`
- `minimizedFields`

When fallback is used, receipts should also include:

- `transformations`
- `fallbackProcessor`
- `fallbackRegion`
- `fallbackModel`

## Evidence Minimization

The EvidenceLedger must remain append-only and hash-chained, but it must not
become a sensitive-data warehouse.

Allowed evidence examples:

- data class
- consent id
- purpose of use
- field digest
- processor id
- model id
- region

Forbidden evidence examples:

- raw treatment notes
- full patient records
- diagnosis free text
- full names
- birth dates
- insurance member ids

If a record must be corrected, append a correction event. Do not mutate or delete
an existing event.

## Conformance

Run:

```bash
pnpm --filter @pshkv/conformance-tests test -- src/regulated-agent-runtime-conformance.test.ts
pnpm --filter @pshkv/conformance-tests test:fixtures
```

The profile passes when:

- every decision flows through `PolicyGateway.intercept()`
- inherited context only narrows
- unapproved processors are denied
- cross-region transfers are denied or rerouted through an approved fallback
- sensitive payloads are minimized in evidence
- transform receipts explain redaction and fallback
- all claims remain runtime-control claims, not certification claims
