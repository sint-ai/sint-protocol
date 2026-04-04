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

`/.well-known/sint.json` advertises:

- protocol version
- bridge profiles
- site profiles
- identity methods
- attestation modes
- schema catalog pointers

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
- `executionEnvelope`

These fields are optional and backward-compatible. Clients that do not send them remain valid.

## Request and Evidence v0.2 Extensions

`SintRequest` supports optional execution metadata under `executionContext`, including:

- deployment profile and site identity
- bridge protocol identity
- executor runtime identity
- model runtime metadata
- attestation metadata
- preapproved corridor metadata

Gateway evidence payloads may include this context for audit and conformance correlation.

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
