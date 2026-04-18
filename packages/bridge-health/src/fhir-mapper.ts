/**
 * SINT bridge-health — FHIR Resource Mapper
 *
 * Maps FHIR R5 resources to SINT resource URIs and actions.
 * Implements consent-based health data governance per Physical AI
 * Governance Roadmap Phase 5.
 *
 * @module @pshkv/bridge-health/fhir-mapper
 */

import { ApprovalTier } from "@pshkv/core";

/**
 * FHIR R5 resource types supported by this bridge.
 * Subset focused on patient-facing health data access.
 */
export type FHIRResourceType =
  | "Patient"
  | "Observation"
  | "Condition"
  | "MedicationRequest"
  | "MedicationStatement"
  | "AllergyIntolerance"
  | "Immunization"
  | "DiagnosticReport"
  | "DocumentReference"
  | "Encounter"
  | "Procedure"
  | "CarePlan"
  | "Goal"
  | "Consent"; // FHIR Consent resource for consent management

/**
 * FHIR interaction types (subset of FHIR RESTful API operations).
 */
export type FHIRInteraction =
  | "read"           // Read a single resource by ID
  | "search-type"    // Search resources by type
  | "create"         // Create a new resource
  | "update"         // Update an existing resource
  | "delete"         // Delete a resource
  | "history"        // Get version history
  | "vread";         // Read a specific version

/**
 * FHIR resource access context for Policy Gateway.
 */
export interface FHIRAccessContext {
  /** FHIR server base URL (e.g., 'https://fhir.example.org') */
  serverUrl: string;
  /** FHIR resource type */
  resourceType: FHIRResourceType;
  /** Resource ID (for read/update/delete operations) */
  resourceId?: string;
  /** FHIR interaction type */
  interaction: FHIRInteraction;
  /** Patient ID (subject of the data access) */
  patientId?: string;
  /** Search parameters (for search-type interactions) */
  searchParams?: Record<string, string>;
}

/**
 * SINT resource mapping for FHIR access.
 */
export interface FHIRResourceMapping {
  /** SINT resource URI (e.g., fhir://server.example.org/Patient/123) */
  resource: string;
  /** SINT action (e.g., 'read', 'create', 'update') */
  action: string;
  /** Minimum required approval tier */
  tier: ApprovalTier;
  /** Additional context for Policy Gateway */
  context: {
    fhirServer: string;
    resourceType: FHIRResourceType;
    interaction: FHIRInteraction;
    patientId?: string;
    resourceId?: string;
    searchParams?: Record<string, string>;
  };
}

/**
 * Default tier mappings for FHIR resource types.
 * Based on sensitivity and HIPAA Safe Harbor categories.
 */
export const FHIR_RESOURCE_TIER_DEFAULTS: Record<FHIRResourceType, ApprovalTier> = {
  // Patient demographics: T0 (public health identifier)
  "Patient": ApprovalTier.T0_OBSERVE,
  
  // Clinical observations: T0 (read-only for patient)
  "Observation": ApprovalTier.T0_OBSERVE,
  "DiagnosticReport": ApprovalTier.T0_OBSERVE,
  
  // Conditions and allergies: T0 (critical safety information)
  "Condition": ApprovalTier.T0_OBSERVE,
  "AllergyIntolerance": ApprovalTier.T0_OBSERVE,
  "Immunization": ApprovalTier.T0_OBSERVE,
  
  // Medications: T1 (logged access, auto-allow for patient)
  "MedicationRequest": ApprovalTier.T1_PREPARE,
  "MedicationStatement": ApprovalTier.T1_PREPARE,
  
  // Care planning: T1 (collaborative documents)
  "CarePlan": ApprovalTier.T1_PREPARE,
  "Goal": ApprovalTier.T1_PREPARE,
  
  // Encounters and procedures: T1 (medical history)
  "Encounter": ApprovalTier.T1_PREPARE,
  "Procedure": ApprovalTier.T1_PREPARE,
  
  // Documents: T1 (may contain sensitive narrative)
  "DocumentReference": ApprovalTier.T1_PREPARE,
  
  // Consent management: T2 (modifying consent requires approval)
  "Consent": ApprovalTier.T2_ACT,
};

/**
 * Tier overrides for specific FHIR interactions.
 * Write operations escalate to higher tiers.
 */
export const FHIR_INTERACTION_TIER_OVERRIDES: Record<FHIRInteraction, number> = {
  "read": 0,           // No escalation for reads
  "search-type": 0,    // No escalation for searches
  "vread": 0,          // No escalation for version reads
  "history": 0,        // No escalation for history
  "create": 2,         // Escalate to T2 (creating new health records)
  "update": 1,         // Escalate by 1 tier (modifying existing records)
  "delete": 2,         // Escalate to T2 (permanent deletion)
};

/**
 * Map a FHIR resource access to a SINT resource URI and action.
 *
 * @param context - FHIR access context
 * @returns SINT resource mapping with tier and context
 *
 * @example
 * ```ts
 * const mapping = mapFHIRToSint({
 *   serverUrl: 'https://fhir.example.org',
 *   resourceType: 'Observation',
 *   resourceId: 'blood-pressure-123',
 *   interaction: 'read',
 *   patientId: 'patient-456',
 * });
 * // Returns:
 * // {
 * //   resource: 'fhir://fhir.example.org/Observation/blood-pressure-123',
 * //   action: 'read',
 * //   tier: ApprovalTier.T0_OBSERVE,
 * //   context: { ... }
 * // }
 * ```
 */
export function mapFHIRToSint(context: FHIRAccessContext): FHIRResourceMapping {
  const { serverUrl, resourceType, resourceId, interaction, patientId, searchParams } = context;
  
  // Construct SINT resource URI
  const baseUrl = serverUrl.replace(/^https?:\/\//, ""); // Remove protocol
  let resource = `fhir://${baseUrl}/${resourceType}`;
  
  if (resourceId) {
    resource += `/${resourceId}`;
  } else if (interaction === "search-type") {
    resource += "/*"; // Wildcard for search
  }
  
  // Get base tier for resource type
  const baseTier = FHIR_RESOURCE_TIER_DEFAULTS[resourceType] ?? ApprovalTier.T1_PREPARE;
  
  // Apply interaction tier override
  const tierEscalation = FHIR_INTERACTION_TIER_OVERRIDES[interaction] ?? 0;
  const tier = escalateTier(baseTier, tierEscalation);
  
  return {
    resource,
    action: interaction,
    tier,
    context: {
      fhirServer: serverUrl,
      resourceType,
      interaction,
      patientId,
      resourceId,
      searchParams,
    },
  };
}

/**
 * Escalate a tier by a given amount.
 *
 * @param baseTier - Starting tier
 * @param escalation - Number of tiers to escalate (0-3)
 * @returns Escalated tier (capped at T3_COMMIT)
 */
function escalateTier(baseTier: ApprovalTier, escalation: number): ApprovalTier {
  if (escalation === 0) return baseTier;
  
  const tierValue = {
    [ApprovalTier.T0_OBSERVE]: 0,
    [ApprovalTier.T1_PREPARE]: 1,
    [ApprovalTier.T2_ACT]: 2,
    [ApprovalTier.T3_COMMIT]: 3,
  }[baseTier];
  
  const escalatedValue = Math.min(3, tierValue + escalation);
  
  const tiers = [
    ApprovalTier.T0_OBSERVE,
    ApprovalTier.T1_PREPARE,
    ApprovalTier.T2_ACT,
    ApprovalTier.T3_COMMIT,
  ];
  
  return tiers[escalatedValue];
}

/**
 * Check if a FHIR resource contains protected health information (PHI)
 * per HIPAA Safe Harbor guidelines.
 *
 * Protected identifiers include:
 * - Names, addresses, dates (except year)
 * - Phone/fax numbers, email addresses
 * - SSN, medical record numbers, account numbers
 * - Device identifiers, IP addresses
 * - Biometric identifiers, photos
 *
 * @param resourceType - FHIR resource type
 * @returns true if resource typically contains PHI
 */
export function containsPHI(resourceType: FHIRResourceType): boolean {
  const phiResources: FHIRResourceType[] = [
    "Patient",           // Names, addresses, dates of birth
    "DocumentReference", // May contain narrative PHI
    "DiagnosticReport",  // May contain patient identifiers
  ];
  
  return phiResources.includes(resourceType);
}

/**
 * Check if an interaction requires patient consent.
 * Write operations and sharing with third parties require consent.
 *
 * @param interaction - FHIR interaction type
 * @returns true if consent is required
 */
export function requiresConsent(interaction: FHIRInteraction): boolean {
  const consentRequired: FHIRInteraction[] = [
    "create",
    "update",
    "delete",
  ];
  
  return consentRequired.includes(interaction);
}

/**
 * Parse a FHIR resource URL into components.
 *
 * @param fhirUrl - FHIR resource URL (e.g., 'https://fhir.example.org/Patient/123')
 * @returns Parsed components (serverUrl, resourceType, resourceId)
 *
 * @example
 * ```ts
 * const parsed = parseFHIRUrl('https://fhir.example.org/Observation/bp-123');
 * // Returns:
 * // {
 * //   serverUrl: 'https://fhir.example.org',
 * //   resourceType: 'Observation',
 * //   resourceId: 'bp-123'
 * // }
 * ```
 */
export function parseFHIRUrl(fhirUrl: string): {
  serverUrl: string;
  resourceType: FHIRResourceType;
  resourceId?: string;
} | null {
  // Match pattern: https://server.com/ResourceType/resourceId
  const match = fhirUrl.match(/^(https?:\/\/[^/]+)\/([^/]+)(?:\/([^/]+))?/);
  
  if (!match) return null;
  
  const [, serverUrl, resourceType, resourceId] = match;
  
  // Validate resource type
  const validTypes: FHIRResourceType[] = [
    "Patient", "Observation", "Condition", "MedicationRequest",
    "MedicationStatement", "AllergyIntolerance", "Immunization",
    "DiagnosticReport", "DocumentReference", "Encounter",
    "Procedure", "CarePlan", "Goal", "Consent",
  ];
  
  if (!validTypes.includes(resourceType as FHIRResourceType)) {
    return null;
  }
  
  return {
    serverUrl,
    resourceType: resourceType as FHIRResourceType,
    resourceId,
  };
}
