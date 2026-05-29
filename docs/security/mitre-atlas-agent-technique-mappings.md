# MITRE ATLAS Candidate Mappings: Agent Identity Spoofing and Payment Hijacking

Status: candidate mapping packet, awaiting canonical ATLAS technique IDs

## Tracking

- GitHub issue: `#127`
- MITRE ATLAS data issue: `https://github.com/mitre-atlas/atlas-data/issues/11`
- Gmail draft ID: `r-4084736127375409030`
- Recipient: `atlas@mitre.org`
- Current ATLAS data note: public ATLAS data uses `AML.T####` technique IDs and v6 distribution files.

## Candidate Technique: Agent Identity Spoofing

Placeholder ID: `T-XXXX`

Description:

An adversary impersonates a legitimate agent, runtime, or delegated principal to gain access to tools, workflows, funds, physical devices, or privileged context.

SINT mitigations:

- `@sint/gate-capability-tokens`: Ed25519 capability tokens bind `issuer`, `subject`, resource, action, constraints, expiry, and delegation chain.
- `PolicyGateway.intercept()`: validates token signature and verifies `token.subject === request.agentId` before allowing a request to reach a tool or actuator boundary.
- Memory / credential-funnel detection: flags identity claims and credential-access behavior inconsistent with the established session.
- APS/SINT interop fixtures: preserve explicit delegated authority and revocation semantics across identity systems.

Evidence and tests:

- `packages/conformance-tests/fixtures/security/owasp-asi-conformance.v1.json`
- `packages/conformance-tests/src/owasp-asi-conformance.test.ts`
- `packages/capability-tokens/__tests__/aps-crossverify.test.ts`

Enforcement tier:

- Strong proxy enforcement. SINT sits in the pre-action path and denies nonmatching identity/token pairs before execution.

## Candidate Technique: Agent Payment Hijacking

Placeholder ID: `T-YYYY`

Description:

An adversary redirects, inflates, or forges agent payment flows by manipulating payee identity, budget context, usage receipts, or delegated payment authority.

SINT mitigations:

- `EconomyPlugin`: enforces per-agent budgets, budget exhaustion behavior, and route/cost policy.
- Tiered approval gates: high-risk or irreversible payment actions can require T2/T3 approval before execution.
- Receipt binding: payment and route decisions are bound to agent identity, token scope, action intent, and evidence ledger events.
- Payment governance fixtures: cover unauthorized payee redirection, stale receipts, budget exhaustion, and approval bypass attempts.

Evidence and tests:

- `packages/conformance-tests/fixtures/economy/payment-governance.v1.json`
- `packages/conformance-tests/src/payment-governance-fixtures-conformance.test.ts`
- `packages/conformance-tests/src/economy-regression.test.ts`

Enforcement tier:

- Strong proxy enforcement. Payment-related requests are evaluated before settlement or downstream payment execution.

## Machine-Readable Packet

Candidate YAML:

- `docs/security/mitre-atlas-sint-candidate-mappings.yaml`

## Claim Boundary

This packet does not claim that MITRE has accepted or assigned these techniques. It records SINT's candidate mitigation mapping so maintainers can submit or update it once canonical ATLAS IDs are assigned.
