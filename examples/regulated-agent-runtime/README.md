# Regulated Agent Runtime Example

This example shows the intended integration shape for regulated-data workflows:

1. `@pshkv/bridge-health` maps a FHIR operation to a SINT resource/action.
2. The bridge attaches `params.regulatedData`.
3. `PolicyGateway.intercept()` evaluates token scope, processor, model, region,
   fallback, and context-minimization policy.
4. The bridge executes only after an `allow` or approved `transform` decision.

```typescript
import {
  buildFHIRRegulatedRuntimeMetadata,
  mapFHIRToSint,
  withRegulatedRuntimeParams,
} from "@pshkv/bridge-health";
import {
  DefaultRegulatedDataPolicyPlugin,
  PolicyGateway,
} from "@pshkv/gate-policy-gateway";

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
});

const gateway = new PolicyGateway({
  resolveToken: async (tokenId) => tokenStore.get(tokenId),
  regulatedDataPolicy: new DefaultRegulatedDataPolicyPlugin({
    approvedProcessors: ["ehr-core", "in-region-model-router"],
    approvedRegions: ["us-east-1"],
    approvedModels: ["clinical-summary-local"],
    allowedPurposes: ["TREAT"],
  }),
});

const decision = await gateway.intercept({
  requestId,
  timestamp,
  agentId,
  tokenId,
  resource: mapping.resource,
  action: mapping.action,
  params: withRegulatedRuntimeParams({ fhir: mapping.context }, regulatedData),
});
```

Expected outcomes:

- approved processor/model/region returns the normal gateway decision
- unapproved processor/model/region returns `deny`
- approved fallback returns `transform`
- delegated context outside the token scope returns `transform` with minimized
  context fields

See the full guide at `docs/guides/regulated-agent-runtime-quickstart.md`.
