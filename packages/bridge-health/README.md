# @pshkv/bridge-health

**SINT Bridge for Health & Wellbeing** — FHIR + HealthKit/Health Connect governance with consent primitives, differential privacy, and caregiver delegation.

## Overview

`@pshkv/bridge-health` implements **Phase 5** of the [Physical AI Governance Roadmap](../../docs/roadmaps/PHYSICAL_AI_GOVERNANCE_2026-2029.md): health fabric with on-device differential privacy, user-owned keys, and FHIR R5 Consent enforcement.

This bridge enables AI agents to access health data (FHIR resources, Apple HealthKit, Google Health Connect) with:
- **FHIR R5 Consent** as capability tokens
- **Tiered data egress** (on-device RAW → cloud aggregates only)
- **Differential privacy** for household health signals
- **Caregiver delegation** with time-bounded, revocable tokens
- **HIPAA alignment** (administrative, physical, technical safeguards)

## Features

### ✅ FHIR Resource Mapping

Maps [FHIR R5](https://hl7.org/fhir/R5/) resources to SINT governance:

| FHIR Resource | Default Tier | Read | Create/Update |
|---|---|---|---|
| **Patient** | T0_OBSERVE | Allowed | T2_ACT |
| **Observation** | T0_OBSERVE | Allowed | T2_ACT |
| **Condition** | T0_OBSERVE | Allowed | T2_ACT |
| **MedicationRequest** | T1_PREPARE | Logged | T3_COMMIT |
| **DiagnosticReport** | T0_OBSERVE | Allowed | T2_ACT |
| **Consent** | T2_ACT | Requires approval | T3_COMMIT |

### ✅ HealthKit/Health Connect Mapping

Maps Apple HealthKit and Google Health Connect data types:

| Data Type | Sensitivity | On-Device | Off-Device |
|---|---|---|---|
| Step Count | PERSONAL | T0 | T1 |
| Heart Rate | RAW | T0 | T2 |
| Blood Pressure | MEDICAL | T0 | T2 |
| Sleep Analysis | PERSONAL | T0 | T1 |
| Cardiac Events | MEDICAL | T0 | T2 (requires caregiver delegation) |

**Data Sensitivity Tiers:**
- **PUBLIC**: Aggregates (e.g., daily step average)
- **PERSONAL**: Insights (e.g., weekly trends)
- **RAW**: Sensor data (e.g., real-time heart rate waveform)
- **MEDICAL**: Medical records (e.g., blood glucose, prescriptions)

### ✅ FHIR Consent Tokens

FHIR R5 Consent resources as SINT capability tokens:

```typescript
import { createFHIRConsentToken } from "@pshkv/bridge-health";

// Patient grants AI agent read access to Observations for 7 days
const consentToken = createFHIRConsentToken(
  "did:key:patient123",  // grantor (patient)
  "did:key:aiagent456",  // grantee (AI agent)
  ["Observation", "DiagnosticReport"],
  ["read"],
  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
  {
    scope: "patient-privacy",
    category: "INFA",
    purposeOfUse: ["TREAT"], // Treatment purpose
  }
);

await policyGateway.issueToken(consentToken);
```

**Consent Fields:**
- **Grantor**: Patient DID (data owner)
- **Grantee**: Agent/caregiver DID (data accessor)
- **Resource Types**: FHIR resources covered (e.g., `Observation`, `MedicationRequest`)
- **Actions**: Permitted operations (`read`, `create`, `update`, `delete`)
- **Period**: Time window (start + optional end)
- **Purpose of Use**: Why data is accessed (`TREAT`, `RESEARCH`, etc.)

### ✅ Differential Privacy

Aggregate household health signals without raw data exfiltration:

```typescript
import { computePrivacyBudget } from "@pshkv/bridge-health";

// Compute epsilon (privacy budget) for a query
const epsilon = computePrivacyBudget(
  "HKQuantityTypeIdentifierHeartRate",
  "daily",       // aggregation level
  5              // queries performed this month
);
// Returns lower epsilon (more privacy) as query count increases

// Add Laplace noise: answer + Lap(sensitivity / epsilon)
const noisyAnswer = trueAnswer + laplaceNoise(sensitivity / epsilon);
```

**Privacy Budget Tracking:**
- Each query consumes epsilon
- When budget exhausted → no more queries
- Public audit of query log (what, by whom, with what epsilon)

### ✅ Caregiver Delegation Tokens

Time-bounded, scoped, revocable health access:

```typescript
import { createFHIRConsentToken, revokeFHIRConsent } from "@pshkv/bridge-health";

// Elderly parent grants adult child access to health data
const delegationToken = createFHIRConsentToken(
  "did:key:elderly_parent",
  "did:key:adult_child",
  ["Observation", "MedicationRequest", "DiagnosticReport"],
  ["read"],
  new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
  {
    scope: "patient-privacy",
    category: "INFASO", // Security obligations
    purposeOfUse: ["ETREAT"], // Emergency treatment
  }
);

// Later: Patient revokes access
const revocationProof = await revokeFHIRConsent(
  delegationToken,
  "did:key:elderly_parent" // revokedBy
);
// Caregiver's next access attempt fails with revocation proof in Evidence Ledger
```

## Installation

```bash
pnpm add @pshkv/bridge-health
```

## Usage

### FHIR Resource Access

```typescript
import { mapFHIRToSint } from "@pshkv/bridge-health";
import { createPolicyGateway } from "@pshkv/gate-policy-gateway";

const policyGateway = createPolicyGateway({ deployment: "health-safe" });

// Map a FHIR read to SINT
const mapping = mapFHIRToSint({
  serverUrl: "https://fhir.example.org",
  resourceType: "Observation",
  resourceId: "blood-pressure-123",
  interaction: "read",
  patientId: "patient-456",
});

// Route through Policy Gateway
const decision = await policyGateway.evaluatePolicy({
  agentDid: "did:key:aiagent",
  resource: mapping.resource, // fhir://fhir.example.org/Observation/blood-pressure-123
  action: mapping.action,      // read
  tier: mapping.tier,          // T0_OBSERVE
});

if (decision.decision === "allow") {
  // Proceed with FHIR API call
}
```

### HealthKit On-Device Access

```typescript
import { mapHealthKitToSint } from "@pshkv/bridge-health";

// On-device read (no egress)
const mapping = mapHealthKitToSint({
  dataType: "HKQuantityTypeIdentifierStepCount",
  permission: "read",
  aggregation: "daily",
  destination: undefined, // on-device only
});

console.log(mapping);
// {
//   resource: 'healthkit://local/HKQuantityTypeIdentifierStepCount',
//   action: 'read',
//   tier: ApprovalTier.T0_OBSERVE,
//   sensitivity: DataSensitivity.PERSONAL,
//   onDeviceOnly: true,
// }
```

### HealthKit Off-Device Sharing

```typescript
// Share aggregated data with third party
const mapping = mapHealthKitToSint({
  dataType: "HKQuantityTypeIdentifierHeartRate",
  permission: "read",
  aggregation: "weekly", // aggregated (not raw waveform)
  destination: "https://health-app.example.com",
});

console.log(mapping);
// {
//   resource: 'healthkit://local/HKQuantityTypeIdentifierHeartRate',
//   action: 'read',
//   tier: ApprovalTier.T1_PREPARE, // Requires logging
//   sensitivity: DataSensitivity.PERSONAL, // Downgraded from RAW due to aggregation
//   onDeviceOnly: false,
// }
```

## Civil Liberties Guardrails

### Opt-In Only

No ambient health sensing without explicit enrollment:
```typescript
// ❌ BAD: Automatic background health data collection
// ✅ GOOD: User explicitly activates health monitoring
```

### On-Device First

Raw sensor data processed locally, only aggregates transmitted:
```typescript
// ✅ GOOD: On-device heart rate analysis
const onDeviceMapping = mapHealthKitToSint({
  dataType: "HKQuantityTypeIdentifierHeartRate",
  permission: "read",
  destination: undefined, // stays on-device
});
// → T0_OBSERVE (no egress)

// ⚠️ CAUTION: Off-device requires approval
const offDeviceMapping = mapHealthKitToSint({
  dataType: "HKQuantityTypeIdentifierHeartRate",
  permission: "read",
  destination: "https://server.com",
});
// → T2_ACT (requires approval)
```

### Tiered Data Egress

- **Tier 0** (on-device): Raw heart rate waveform
- **Tier 1** (cloud aggregates): Daily average heart rate
- **Tier 2** (third-party): Requires caregiver delegation for medical data

### User-Owned Keys

Health data encrypted with user's key, not provider's:
```typescript
// Evidence Ledger: user's private key encrypts sensitive event payloads
// Caregiver can only access data if user grants delegation token
```

## Compliance

| Framework | Requirement | Implementation |
|---|---|---|
| **HIPAA Administrative Safeguards** | Access control | FHIRConsentToken (scoped, time-bound) |
| **HIPAA Administrative Safeguards** | Audit controls | Evidence Ledger (patient-owned) |
| **HIPAA Physical Safeguards** | Device & media controls | On-device processing (HealthKit stays local) |
| **HIPAA Technical Safeguards** | Access control | Ed25519 signed tokens |
| **HIPAA Technical Safeguards** | Encryption | User-owned keys encrypt health data |
| **HIPAA Technical Safeguards** | Audit logs | Evidence Ledger export for patient |
| **GDPR Article 5** | Data minimization | On-device first, aggregates only egress |
| **GDPR Article 6** | Lawful basis | FHIRConsent.purposeOfUse field |
| **GDPR Article 15** | Right to access | Evidence Ledger export API (user-scoped) |
| **GDPR Article 25** | Data protection by design | On-device processing, user-owned keys |

## Related Packages

- `@pshkv/gate-policy-gateway` — Core authorization engine
- `@pshkv/gate-capability-tokens` — Cryptographic access tokens
- `@pshkv/evidence-ledger` — Tamper-evident audit log
- `@pshkv/bridge-homeassistant` — Consumer smart home governance

## Roadmap

This package implements **Phase 5** of the Physical AI Governance Roadmap:

- ✅ **FHIR resource mapping** (this release)
- ✅ **HealthKit/Health Connect mapping** (this release)
- ✅ **FHIR Consent tokens** (this release)
- 🚧 **Differential privacy ledger** (Phase 5.2)
- 🚧 **Caregiver delegation implementation** (Phase 5.3)

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for development setup.

## License

Apache-2.0 — see [LICENSE](LICENSE)
