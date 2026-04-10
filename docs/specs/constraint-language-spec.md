# SINT Constraint Language Specification (CL-1.0)

Status: Draft for Q3 roadmap execution (`#67`)

## Purpose

Constraint Language (`CL-1.0`) defines a portable, machine-readable envelope for runtime safety and governance controls across bridges (`mcp`, `a2a`, `ros2`, `mqtt-sparkplug`, `opcua`, `open-rmf`, `grpc`).

It standardizes how constraints are represented, transported, and audited.

## Design Goals

- Single envelope shape for token-time and runtime enforcement.
- Tighten-only runtime adaptation (dynamic constraints can only become stricter).
- Backward compatibility for existing `executionEnvelope` style fields.
- Bridge-neutral semantics with deterministic policy evaluation.

## Envelope Structure

`ConstraintEnvelope` supports:

- `version`: schema version (`cl-1.0`)
- `mode`: `static-token` | `dynamic-runtime` | `corridor-preapproved`
- `physical`: force/velocity/geofence/safety limits
- `behavioral`: payload/pattern/rate controls
- `model`: model allowlists and fingerprints
- `attestation`: TEE grade/backend and tier requirements
- `dynamic`: runtime tightening provenance metadata
- `execution`: preapproved corridor envelope
- `extensions`: additive vendor-specific fields

Legacy top-level corridor fields are still valid:

- `corridorId`
- `expiresAt`
- `maxDeviationMeters`
- `maxHeadingDeviationDeg`
- `maxVelocityMps`
- `maxForceNewtons`

## Canonical Example

```json
{
  "version": "cl-1.0",
  "mode": "dynamic-runtime",
  "physical": {
    "maxVelocityMps": 0.6,
    "maxForceNewtons": 120,
    "requiresHumanPresence": true,
    "rateLimit": { "maxCalls": 30, "windowMs": 60000 }
  },
  "model": {
    "allowedModelIds": ["gpt-5.4", "gemini-robotics"],
    "modelFingerprintHash": "4be7f7b0f0ab2f8f2e4a1f2b6d4a7e4e1a8b0c1d2e3f4a5b6c7d8e9f0a1b2c3d"
  },
  "dynamic": {
    "tightenOnly": true,
    "pluginRef": "dynamic-envelope.obstacle-v1",
    "evidenceRequired": true
  },
  "execution": {
    "corridorId": "aisle-7-corridor-a",
    "expiresAt": "2026-04-07T12:00:00.000Z",
    "maxDeviationMeters": 0.2
  }
}
```

## Enforcement Semantics

1. Missing required runtime metadata for enforced controls results in deny/escalate (fail-closed).
2. `dynamic.tightenOnly=true` forbids envelope widening at runtime.
3. If both legacy and `execution.*` fields are present, `execution.*` is authoritative.
4. Constraint violations must be represented in policy decision rationale and evidence payload.

## Compatibility Rules

- Unknown top-level fields are invalid unless placed under `extensions`.
- New standard fields must be additive and optional in minor revisions.
- Existing field semantics must not be repurposed.

## Validation Surface

- Machine-readable schema: `GET /v1/schemas/constraint-envelope`
- Source: `packages/core/src/constants/schema-catalog.ts`
- Regression tests: `packages/core/__tests__/schema-catalog.test.ts`
