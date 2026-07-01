# Regulated Agent Runtime Quickstart

This guide shows the SINT-native path for governing an agent workflow that
touches regulated data.

The flow is:

`FHIR mapping -> regulated runtime metadata -> PolicyGateway.intercept() -> decision receipt`

The bridge prepares facts. The gateway makes the decision.

## What This Covers

- map a FHIR resource access into a SINT resource/action
- attach `params.regulatedData`
- configure the regulated-data policy plugin
- deny unsafe processor/model/region paths
- transform requests through approved fallback routing
- preserve minimized audit fields for the EvidenceLedger

## Install Packages

Inside this monorepo, use the workspace packages:

```bash
pnpm install
```

For an external application, install:

```bash
pnpm add @pshkv/bridge-health @pshkv/gate-policy-gateway @pshkv/gate-capability-tokens
```

## Configure The Gateway

```typescript
import {
  DefaultRegulatedDataPolicyPlugin,
  PolicyGateway,
} from "@pshkv/gate-policy-gateway";

const regulatedDataPolicy = new DefaultRegulatedDataPolicyPlugin({
  approvedProcessors: ["ehr-core", "in-region-model-router"],
  approvedRegions: ["us-east-1", "us-west-2"],
  approvedModels: ["clinical-summary-local", "intake-triage-approved"],
  allowedPurposes: ["TREAT", "PAYMENT", "ADMIN"],
});

const gateway = new PolicyGateway({
  resolveToken: async (tokenId) => tokenStore.get(tokenId),
  regulatedDataPolicy,
  emitLedgerEvent: (event) => ledger.append(event),
});
```

The plugin runs after token validation and before normal tier assignment. If it
returns a deny or transform decision, the request stops there.

When a token carries `regulatedDataPolicy`, the plugin intersects those
token-bound allowlists with deployment defaults. The token can narrow processor,
model, region, purpose, data class, context-field, and fallback authority. It
cannot expand deployment policy.

```typescript
const tokenRequest = {
  issuer,
  subject: agentId,
  resource: "fhir://fhir.example.org/Observation/*",
  actions: ["read"],
  constraints: {},
  regulatedDataPolicy: {
    allowedDataClasses: ["PHI"],
    allowedPurposes: ["TREAT"],
    approvedProcessors: ["in-region-model-router"],
    approvedRegions: ["us-east-1"],
    approvedModels: ["clinical-summary-local"],
    allowedContextFields: ["resourceType", "interaction", "resourceId"],
    allowFallback: true,
  },
  delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
  expiresAt,
  revocable: true,
};
```

## Build Regulated Metadata

```typescript
import {
  buildFHIRRegulatedRuntimeMetadata,
  mapFHIRToSint,
  withRegulatedRuntimeParams,
} from "@pshkv/bridge-health";

const mapping = mapFHIRToSint({
  serverUrl: "https://fhir.example.org",
  resourceType: "Observation",
  resourceId: "blood-pressure-123",
  interaction: "read",
  patientId: "patient-456",
});

const regulatedData = buildFHIRRegulatedRuntimeMetadata(mapping, {
  purposeOfUse: "TREAT",
  processor: "in-region-model-router",
  region: "us-east-1",
  model: "clinical-summary-local",
  requestedContextFields: ["resourceType", "interaction", "resourceId"],
});

const params = withRegulatedRuntimeParams(
  { fhir: mapping.context },
  regulatedData,
);
```

The resulting request params include:

```json
{
  "regulatedData": {
    "dataClasses": ["PHI"],
    "purposeOfUse": "TREAT",
    "processor": "in-region-model-router",
    "region": "us-east-1",
    "model": "clinical-summary-local",
    "requestedContextFields": ["resourceType", "interaction", "resourceId"]
  }
}
```

## Intercept The Request

```typescript
const decision = await gateway.intercept({
  requestId,
  timestamp,
  agentId,
  tokenId,
  resource: mapping.resource,
  action: mapping.action,
  params,
});
```

If the processor, region, model, purpose, token scope, or delegated context is
not allowed, the gateway returns `deny` or `transform` before execution.

## Approved Fallback

Use fallback when a bridge can safely reroute to an approved model, processor, or
region:

```typescript
const regulatedData = buildFHIRRegulatedRuntimeMetadata(mapping, {
  purposeOfUse: "TREAT",
  processor: "external-processor",
  region: "eu-central-1",
  model: "general-model",
  fallback: {
    processor: "in-region-model-router",
    region: "us-east-1",
    model: "clinical-summary-local",
    transformations: [
      "redact_direct_identifiers",
      "route_to_approved_region",
      "route_to_approved_model",
    ],
  },
});
```

The gateway returns a `transform` decision with audit fields describing the
fallback route. Downstream execution should use the transformed route, not the
original unsafe path.

## Evidence Rules

Ledger events should carry decision metadata, not raw sensitive payloads.

Allowed examples:

- data class
- consent id
- purpose of use
- processor id
- model id
- region
- field digest

Forbidden examples:

- raw treatment notes
- full patient records
- diagnosis free text
- full names
- birth dates
- insurance member ids

## Verify

Run the focused checks:

```bash
CI=true npx pnpm@9.15.0 --filter @pshkv/bridge-health test
CI=true npx pnpm@9.15.0 --filter @pshkv/gate-policy-gateway test -- regulated-data-policy.test.ts
CI=true npx pnpm@9.15.0 --filter @pshkv/conformance-tests test -- src/regulated-agent-runtime-conformance.test.ts
```

Run the broader fixture gate:

```bash
CI=true npx pnpm@9.15.0 --filter @pshkv/conformance-tests test:fixtures
```
