/**
 * @pshkv/bridge-health — SINT Bridge for Health & Wellbeing
 *
 * FHIR + HealthKit/Health Connect governance with consent primitives,
 * differential privacy, and caregiver delegation. Implements Phase 5
 * of Physical AI Governance Roadmap.
 *
 * @packageDocumentation
 */

// FHIR resource mapping
export {
  mapFHIRToSint,
  parseFHIRUrl,
  containsPHI,
  requiresConsent,
  FHIR_RESOURCE_TIER_DEFAULTS,
  FHIR_INTERACTION_TIER_OVERRIDES,
  type FHIRResourceType,
  type FHIRInteraction,
  type FHIRAccessContext,
  type FHIRResourceMapping,
} from "./fhir-mapper.js";

// HealthKit/Health Connect mapping
export {
  mapHealthKitToSint,
  requiresCaregiverDelegation,
  computePrivacyBudget,
  getHealthKitDescription,
  HEALTHKIT_SENSITIVITY_DEFAULTS,
  DataSensitivity,
  type HealthKitQuantityType,
  type HealthKitCategoryType,
  type HealthKitDataType,
  type HealthKitPermission,
  type HealthKitAccessContext,
  type HealthKitResourceMapping,
} from "./healthkit-mapper.js";

// FHIR Consent tokens
export {
  createFHIRConsentToken,
  matchesFHIRConsent,
  revokeFHIRConsent,
  explainFHIRConsent,
  type ConsentProvision,
  type ConsentScope,
  type ConsentCategory,
  type FHIRConsentExtension,
  type FHIRConsentToken,
} from "./fhir-consent-token.js";

// Caregiver delegation tokens
export {
  createCaregiverDelegationToken,
  renewCaregiverDelegation,
  revokeCaregiverDelegation,
  matchesCaregiverDelegation,
  explainCaregiverDelegation,
  createCaregiverAuditEntry,
  type CaregiverRelationship,
  type AccessScope,
  type CaregiverDelegationExtension,
  type CaregiverDelegationToken,
} from "./caregiver-delegation.js";
