# Human-Agent Authority Roadmap

Status: proposed 2026 upgrade lane

This roadmap translates the Yanez-style proof-of-humanhood and proof-of-
uniqueness pattern into SINT protocol work. It is not a Yanez integration. It
is a vendor-neutral plan for binding AI-agent, robot, payment, approval, and
physical-world actions back to privacy-preserving human authority.

## External Signal

Yanez publicly positions its product around:

- proof of humanhood and proof of uniqueness;
- cryptographically verifiable, hardware-agnostic, decentralized proofs;
- agentic delegation chains where AI agents act on behalf of humans;
- privacy-preserving zero-knowledge attestations where biometric data does not
  leave the device;
- tiered assurance levels matched to real-world risk;
- contextual binding by application, value range, or time window;
- compatibility with W3C DIDs / Verifiable Credentials, EVM ecosystems, Google
  Private State Tokens, payment infrastructure, MPC, and secure enclaves;
- use cases in Web3 Sybil resistance and regulated financial infrastructure.

Sources reviewed:

- Yanez.ai home page: https://www.yanez.ai/
- Yanez resources page: https://www.yanez.ai/resources
- Yanez announcements page: https://www.yanez.ai/news-announcements
- Yanez / Nexartis partnership announcement describing verification of whether
  digital actions, content, and transactions originate from a real person, an
  AI model, or an authorized agent.
- Yanez / Bitmind partnership announcement describing face deepfake detection on
  Bittensor.

## Strategic Read

SINT already governs capability tokens, approval tiers, physical constraints,
and hash-chained evidence. The next missing trust primitive is not only "is this
agent authorized?" but:

- is there a unique human principal behind this authority?
- did that human intentionally delegate this action?
- is the delegation scoped to this site, robot, value range, time window, and
  task?
- can a verifier prove enough about the human without learning who they are?
- can regulated actions show non-repudiable consent without centralizing
  identity data?

This matters for physical AI because high-consequence actions often require
human accountability, not just machine identity. It also matters for agent
payments, marketplace work, DAO-style governance, operator approvals, teleop,
consumer smart-home control, and incident review.

## Product Thesis

For human-agent authority, SINT should answer seven questions:

1. Which unique human, organization, or role ultimately authorized this action?
2. What assurance level was required for the action's tier and context?
3. Was authority delegated to this specific agent, robot, model, or bridge?
4. Was delegation bounded by time, value, resource, physical site, and action?
5. Can the verifier confirm humanhood, uniqueness, and consent without exposing
   private identity data?
6. Can a human revoke or attenuate delegated authority immediately?
7. Can the ledger prove who authorized the chain without storing sensitive
   biometric or identity payloads?

## Assurance Model

SINT should map identity assurance to existing approval tiers:

| SINT tier | Human-agent authority requirement |
|---|---|
| T0 observe | optional humanhood proof for privacy-sensitive data |
| T1 prepare | proof of humanhood or organization role for durable writes |
| T2 act | proof of uniqueness plus explicit delegation or operator approval |
| T3 commit | high-assurance delegation, contextual binding, non-repudiation, and optionally M-of-N human quorum |

The assurance model should remain provider-neutral. A deployment may use DIDs,
VCs, hardware-backed keys, secure enclaves, MPC, passkeys, institutional IAM,
zero-knowledge proofs, or future proof-of-human systems. SINT should verify
claims and evidence shape, not require one identity vendor.

## Upgrade Tracks

### Y1. Human Principal Envelope

Goal: add typed human-principal metadata to SINT authority without exposing
private identity data.

Deliverables:

- `HumanPrincipalRef`:
  - subject pseudonym or DID
  - proof provider reference
  - assurance level
  - humanhood proof reference
  - uniqueness proof reference
  - proof freshness
  - privacy-preserving disclosure claims
  - revocation status reference
- `HumanAuthorityEnvelope` token extension:
  - required assurance level
  - allowed proof providers
  - allowed principal roles
  - required freshness
  - required contextual binding fields
  - allowed delegation depth
- conformance fixtures for:
  - missing human principal
  - stale proof
  - insufficient assurance level
  - duplicate principal attempt
  - provider not allowlisted

Target packages:

- `packages/core`
- `packages/capability-tokens`
- `packages/policy-gateway`
- `packages/conformance-tests`

### Y2. Delegated Agent Authority Chains

Goal: bind every delegated agent action to a human-origin authority chain.

Deliverables:

- `HumanDelegationChain`:
  - human principal reference
  - delegating application or organization
  - agent identity
  - bridge/runtime identity
  - delegated resource/action scope
  - expiration and revocation reference
  - consent receipt digest
  - attenuation proof
- gateway checks:
  - deny if agent action lacks required human delegation
  - deny if child token widens human-granted scope
  - deny if delegation proof is stale or revoked
  - escalate if delegation chain crosses organization boundary
  - record non-repudiable delegation evidence

Target packages:

- `packages/capability-tokens`
- `packages/policy-gateway`
- `packages/evidence-ledger`
- `apps/sint-mcp`

### Y3. Contextual Binding For High-Consequence Actions

Goal: prevent replay of valid human proofs into the wrong action context.

Deliverables:

- contextual binding fields:
  - application ID
  - organization/site ID
  - robot or tool ID
  - resource/action
  - value or budget range
  - physical geofence or site
  - time window
  - model/runtime identity
  - approval purpose
- policy checks:
  - deny proof replay outside bound context
  - deny payment or physical actuation outside value/site window
  - escalate if context partially matches but risk tier is T2/T3
  - emit `authority.context.mismatch` ledger event

Target packages:

- `packages/core`
- `packages/policy-gateway`
- `packages/conformance-tests`

### Y4. Privacy-Preserving Approval Receipts

Goal: let SINT prove human review occurred without publishing personal identity
or biometric material into the ledger.

Deliverables:

- `PrivacyPreservingApprovalReceipt`:
  - request ID
  - assurance level
  - verifier reference
  - proof hash
  - disclosed claims
  - non-disclosed claim commitments
  - revocation check reference
  - approval signature or quorum proof
- ledger behavior:
  - store proof refs and hashes, not raw biometric data
  - support redacted export for public or customer review
  - support restricted export for regulator or incident investigation
  - append correction events rather than mutating identity records

Target packages:

- `packages/evidence-ledger`
- `packages/core`
- `apps/sintctl`
- `docs/guides`

### Y5. Anti-Sybil Operator And Quorum Controls

Goal: prevent one person or duplicated account from satisfying many human
approval slots.

Deliverables:

- uniqueness-aware approval quorum:
  - N unique humans, not only N credentials
  - organization/role diversity constraints
  - conflict-of-interest markers
  - one-human-one-approval enforcement
- policy checks:
  - deny duplicate-human quorum satisfaction
  - deny self-approval where the human principal delegated the agent
  - require independent operator for high-risk T3 actions
  - emit quorum uniqueness evidence

Target packages:

- `packages/policy-gateway`
- `packages/evidence-ledger`
- `apps/dashboard`
- `apps/sint-interface`

### Y6. Agentic Payment And Spending Authority

Goal: strengthen SINT's economic layer with human-origin spending proofs.

Deliverables:

- `SpendingAuthorityEnvelope`:
  - human principal reference
  - merchant/counterparty scope
  - max amount
  - currency/rail
  - recurrence limits
  - geographic or jurisdictional limits
  - revocation reference
- policy checks:
  - deny payment outside delegated amount or counterparty scope
  - require T3 proof for irreversible settlement
  - require fresh human proof for new recurring payment
  - emit payment authorization receipt

Target packages:

- `packages/bridge-economy`
- `packages/policy-gateway`
- `packages/evidence-ledger`
- `packages/conformance-tests`

### Y7. Human-In-The-Loop Physical AI Control

Goal: require human-origin authority for physical actions where policy says
"human review" is not enough unless the human is unique, authorized, and fresh.

Deliverables:

- physical approval profiles:
  - operator approval
  - supervisor approval
  - safety officer approval
  - caregiver approval
  - site authority approval
  - emergency dispatcher approval
- policy checks:
  - T2 act requires role-scoped human approval in selected deployments
  - T3 commit requires high-assurance unique human plus quorum
  - teleoperation requires authenticated human principal and session binding
  - e-stop remains unconditional and does not wait for identity proof

Target packages:

- `packages/policy-gateway`
- `packages/autonomy-supervisor`
- `apps/dashboard`
- `apps/sint-interface`

### Y8. Identity Provider Adapter Interface

Goal: make SINT interoperable with human-proof providers without vendor lock-in.

Deliverables:

- `HumanProofVerifierPlugin` interface:
  - verify humanhood
  - verify uniqueness
  - verify contextual binding
  - check revocation
  - return disclosed claims and proof refs
- reference adapters:
  - W3C DID / VC verifier stub
  - passkey / WebAuthn verifier stub
  - hardware attestation verifier stub
  - zero-knowledge proof verifier stub
  - institutional IAM verifier stub
- conformance vectors for verifier failure, stale proof, and insufficient
  assurance.

Target packages:

- `packages/policy-gateway`
- `packages/core`
- `packages/conformance-tests`

## Execution Plan

### Sprint 1: Authority Data Model

- define `HumanPrincipalRef`
- define `HumanAuthorityEnvelope`
- define `HumanDelegationChain`
- add schema and conformance fixtures for assurance-level failures

### Sprint 2: Gateway Enforcement

- add `HumanProofVerifierPlugin`
- wire human authority checks after token validation and before tier assignment
- add contextual binding checks
- emit `authority.human.verified`, `authority.delegation.verified`, and
  `authority.context.mismatch` events

### Sprint 3: Approval And Quorum Upgrade

- add uniqueness-aware quorum checks
- add privacy-preserving approval receipts
- update dashboard/operator flows for assurance-level requirements
- add self-approval and duplicate-human denial fixtures

### Sprint 4: Economic And Physical-AI Profiles

- add spending authority profile to the economy bridge
- add high-assurance operator approval profile for physical AI T2/T3 actions
- add teleoperation authority binding
- add public docs for claim boundaries and deployment choices

### Sprint 5: Provider Adapter Pack

- add DID/VC, passkey, hardware-attestation, ZK-proof, and IAM verifier stubs
- publish sample receipts with redacted proof material
- add `sintctl authority verify` and `sintctl authority receipt export`

## Definition Of Done

- SINT can require humanhood, uniqueness, and contextual delegation by tier.
- Human-origin authority can be verified without storing raw biometric or
  identity data in the ledger.
- Delegated agent authority is attenuation-only and revocable.
- High-risk approvals can require unique humans, not only unique credentials.
- Payment and physical-actuation authority can be bound to value, site, robot,
  application, and time window.
- Provider integration is plugin-based and standards-friendly.
- Docs state claim boundaries clearly: SINT verifies authority evidence,
  delegation scope, and receipts; it does not itself prove biometric liveness,
  operate a human-uniqueness network, or replace regulated KYC/AML, employment,
  safety, or identity-compliance obligations.

