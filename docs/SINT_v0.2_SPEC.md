# SINT Protocol v0.2 Specification

## Boundary Statement

SINT is the governance and runtime enforcement layer for digital-to-physical execution.

- MCP remains agent-to-tool transport.
- A2A remains agent-to-agent transport.
- SINT defines delegated authority, runtime safety policy, approval resolution, and tamper-evident evidence behavior across these transports.

## Discovery Contract

Gateways implementing v0.2 MUST expose:

- `GET /.well-known/sint.json`
- `GET /v1/schemas`
- `GET /v1/schemas/:name`
- `GET /v1/openapi.json`
- `GET /v1/compliance/tier-crosswalk`

`/.well-known/sint.json` advertises:

- protocol version
- bridge profiles
- site profiles
- identity methods
- attestation modes
- schema catalog pointers
- compliance crosswalk pointer + framework identifiers

## Stable Public Nouns

The following nouns are frozen for v0.2 protocol surface compatibility:

- `CapabilityToken`
- `ApprovalTier`
- `PolicyDecision`
- `ConstraintEnvelope`
- `EvidenceEvent`
- `BridgeProfile`
- `SiteProfile`
- `ApprovalQuorum`
- `Revocation`

## Capability Token v0.2 Extensions

`SintCapabilityToken` and issuance request payloads include optional fields:

- `modelConstraints`
- `attestationRequirements`
- `verifiableComputeRequirements`
- `executionEnvelope`
- `constraints.quorum`

These fields are optional and backward-compatible. Clients that do not send them remain valid.

## Request and Evidence v0.2 Extensions

`SintRequest` supports optional execution metadata under `executionContext`, including:

- deployment profile and site identity
- bridge protocol identity
- executor runtime identity
- model runtime metadata
- attestation metadata
- verifiable compute proof metadata
- hardware safety-controller handshake metadata (`permit`, `interlock`, `estop`)
- preapproved corridor metadata

Gateway evidence payloads may include this context for audit and conformance correlation.

## Verifiable Compute Hooks

SINT v0.2 includes tier-gated proof hooks for critical actions:

- Tokens MAY require proof metadata through `verifiableComputeRequirements`.
- Requests MAY attach proof metadata through `executionContext.verifiableCompute`.
- Gateways MUST fail-closed on required tiers when required proof metadata is absent, stale, or not allowlisted.
- Deployments MAY provide a backend-specific verifier plugin (e.g., zkVM receipt verification).

## Avatar/CSML Runtime

Gateway deployments SHOULD enable CSML-based tier escalation by default, using
recent evidence-ledger history to bump risky agents by at least one tier when
their score exceeds deployment threshold `θ`.

## Edge Mode Contract

For `edge-gateway` deployments, v0.2 defines fail-closed semantics for high-consequence actions:

- Local enforcement may auto-allow `T0_observe` and `T1_prepare`.
- `T2_act` and `T3_commit` actions MUST require a reachable central approval authority.
- If central approval is unavailable, edge gateways MUST deny (never fail-open) T2/T3 escalations.
- Revocation observations and evidence events SHOULD be relayed/replicated to central control planes when connectivity permits.

## Hardware Safety Handshake Contract

For industrial deployment profiles (`warehouse-amr`, `industrial-cell`), v0.2 supports
optional `executionContext.hardwareSafety` metadata with fail-closed behavior:

- `estopState=triggered` MUST block execution immediately.
- `T2_act`/`T3_commit` requests in industrial profiles MUST be denied when
  hardware permit is not granted.
- Interlock states other than `closed` SHOULD be treated as fail-closed.
- Safety controller state SHOULD be fresh (non-stale) at decision time.

## Compatibility Rules

- New fields MUST be additive and optional by default.
- Existing required fields and enums MUST NOT be repurposed in patch releases.
- Unknown optional fields MUST be ignored by v0.2-compliant servers.
- Security defaults MUST be fail-closed for T2/T3 actions.

## Industrial Profiles

First-class deployment profiles in v0.2:

- `warehouse-amr`
- `industrial-cell`
- `edge-gateway`

First-class bridge profiles in v0.2:

- `mcp`
- `a2a`
- `ros2`
- `mavlink`
- `mqtt-sparkplug`
- `opcua`
- `open-rmf`
