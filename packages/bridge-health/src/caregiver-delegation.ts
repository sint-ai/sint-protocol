/**
 * SINT bridge-health — Caregiver Delegation Tokens
 *
 * Time-bounded, scoped, revocable health data access for caregivers.
 * Implements Phase 5 caregiver delegation per Physical AI Governance
 * Roadmap 2026-2029.
 *
 * @module @pshkv/bridge-health/caregiver-delegation
 */

import type { CapabilityToken } from "@pshkv/gate-capability-tokens";
import { ApprovalTier } from "@pshkv/core";
import type { FHIRResourceType } from "./fhir-mapper.js";
import type { HealthKitDataType, DataSensitivity } from "./healthkit-mapper.js";

/**
 * Caregiver relationship types.
 */
export type CaregiverRelationship =
  | "family-member"      // Family caregiver
  | "professional-nurse" // Professional nurse
  | "physician"          // Medical doctor
  | "therapist"          // Physical/occupational therapist
  | "home-health-aide"   // Home health aide
  | "emergency-contact"; // Emergency contact person

/**
 * Access scope for caregiver delegation.
 */
export type AccessScope = "read" | "read-write" | "emergency-only";

/**
 * Caregiver delegation extension for SINT capability tokens.
 */
export interface CaregiverDelegationExtension {
  /** Patient DID (delegator - data owner) */
  delegator: string;
  
  /** Caregiver DID (delegate - data accessor) */
  delegate: string;
  
  /** Caregiver relationship to patient */
  relationship: CaregiverRelationship;
  
  /** Access scope */
  scope: AccessScope;
  
  /** FHIR resource types permitted */
  allowedFhirResources?: FHIRResourceType[];
  
  /** HealthKit data types permitted */
  allowedHealthKitTypes?: HealthKitDataType[];
  
  /** Specific resource IDs (for fine-grained delegation) */
  specificResourceIds?: string[];
  
  /** Valid time period */
  validPeriod: {
    start: Date;
    end?: Date; // undefined = requires explicit renewal
  };
  
  /** Emergency override (allows T3 actions in emergencies) */
  emergencyOverride: boolean;
  
  /** Data sensitivity ceiling (caregiver cannot access data above this level) */
  maxSensitivity: DataSensitivity;
  
  /** Renewal count (how many times this delegation has been renewed) */
  renewalCount: number;
  
  /** Cryptographic revocation proof (if revoked) */
  revocationProof?: {
    revokedAt: Date;
    revokedBy: string; // DID of revoker
    signature: string;  // Ed25519 signature
  };
}

/**
 * Caregiver Delegation Token = SINT Capability Token + Delegation Extension.
 */
export interface CaregiverDelegationToken extends CapabilityToken {
  caregiverDelegation: CaregiverDelegationExtension;
}

/**
 * Create a Caregiver Delegation Token for health data access.
 *
 * @param delegator - Patient DID (data owner)
 * @param delegate - Caregiver DID (data accessor)
 * @param relationship - Caregiver relationship type
 * @param allowedResources - FHIR resources and/or HealthKit types
 * @param validUntil - Token expiration (default: 30 days)
 * @param options - Additional delegation options
 * @returns Caregiver Delegation Token for Policy Gateway
 *
 * @example
 * ```ts
 * // Elderly parent grants adult child access to health data
 * const delegationToken = createCaregiverDelegationToken(
 *   'did:key:elderly_parent',
 *   'did:key:adult_child',
 *   'family-member',
 *   {
 *     fhir: ['Observation', 'MedicationRequest', 'DiagnosticReport'],
 *     healthkit: ['HKQuantityTypeIdentifierBloodPressure', 'HKQuantityTypeIdentifierHeartRate'],
 *   },
 *   new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
 *   {
 *     scope: 'read',
 *     emergencyOverride: true,
 *     maxSensitivity: 'MEDICAL',
 *   }
 * );
 * ```
 */
export function createCaregiverDelegationToken(
  delegator: string,
  delegate: string,
  relationship: CaregiverRelationship,
  allowedResources: {
    fhir?: FHIRResourceType[];
    healthkit?: HealthKitDataType[];
  },
  validUntil?: Date,
  options?: {
    scope?: AccessScope;
    emergencyOverride?: boolean;
    maxSensitivity?: DataSensitivity;
    specificResourceIds?: string[];
  }
): Partial<CaregiverDelegationToken> {
  const now = new Date();
  const expiresAt = validUntil ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days default
  
  // Determine actions based on scope
  const scope = options?.scope ?? "read";
  const actions = scope === "read-write" ? ["read", "create", "update"] : ["read"];
  
  // Determine tier based on sensitivity and emergency override
  const maxSensitivity = options?.maxSensitivity ?? "MEDICAL";
  const emergencyOverride = options?.emergencyOverride ?? false;
  const tier = emergencyOverride ? ApprovalTier.T3_COMMIT : ApprovalTier.T2_ACT;
  
  // Construct resource URI pattern
  // For FHIR: fhir://*/{ResourceType1,ResourceType2}/*
  // For HealthKit: healthkit://local/{DataType1,DataType2}
  let resourcePattern = "";
  if (allowedResources.fhir && allowedResources.fhir.length > 0) {
    resourcePattern = `fhir://*/${allowedResources.fhir.join(",")}/*`;
  } else if (allowedResources.healthkit && allowedResources.healthkit.length > 0) {
    resourcePattern = `healthkit://local/${allowedResources.healthkit.join(",")}`;
  }
  
  return {
    subject: delegate,
    resource: resourcePattern,
    actions,
    tier,
    issuedAt: now,
    expiresAt,
    caregiverDelegation: {
      delegator,
      delegate,
      relationship,
      scope,
      allowedFhirResources: allowedResources.fhir,
      allowedHealthKitTypes: allowedResources.healthkit,
      specificResourceIds: options?.specificResourceIds,
      validPeriod: {
        start: now,
        end: expiresAt,
      },
      emergencyOverride,
      maxSensitivity,
      renewalCount: 0,
    },
  };
}

/**
 * Renew a Caregiver Delegation Token.
 * Extends the valid period and increments renewal count.
 *
 * @param token - Existing delegation token
 * @param newExpiry - New expiration date
 * @returns Renewed token with updated period and renewal count
 */
export function renewCaregiverDelegation(
  token: CaregiverDelegationToken,
  newExpiry: Date
): CaregiverDelegationToken {
  return {
    ...token,
    expiresAt: newExpiry,
    caregiverDelegation: {
      ...token.caregiverDelegation,
      validPeriod: {
        ...token.caregiverDelegation.validPeriod,
        end: newExpiry,
      },
      renewalCount: token.caregiverDelegation.renewalCount + 1,
    },
  };
}

/**
 * Revoke a Caregiver Delegation Token.
 * Generates cryptographic proof of revocation.
 *
 * @param token - Delegation token to revoke
 * @param revokedBy - DID of entity revoking (typically delegator)
 * @returns Revocation proof with cryptographic signature
 */
export async function revokeCaregiverDelegation(
  token: CaregiverDelegationToken,
  revokedBy: string
): Promise<{
  tokenId: string;
  revokedAt: Date;
  revokedBy: string;
  proof: string; // Ed25519 signature
}> {
  const revokedAt = new Date();
  
  // Create revocation payload
  const payload = {
    tokenId: token.id ?? "",
    revokedAt: revokedAt.toISOString(),
    revokedBy,
    delegator: token.caregiverDelegation.delegator,
    delegate: token.caregiverDelegation.delegate,
  };
  
  // TODO: Sign with revokedBy's private key (Ed25519)
  // For now, return placeholder proof
  const proof = Buffer.from(JSON.stringify(payload)).toString("base64");
  
  return {
    tokenId: token.id ?? "",
    revokedAt,
    revokedBy,
    proof,
  };
}

/**
 * Check if a health data access request matches a caregiver delegation token.
 *
 * @param token - Caregiver Delegation Token
 * @param resourceType - Resource type being accessed (FHIR or HealthKit)
 * @param action - Action being performed
 * @param sensitivity - Data sensitivity level (for HealthKit)
 * @returns true if delegation permits this access
 */
export function matchesCaregiverDelegation(
  token: CaregiverDelegationToken,
  resourceType: FHIRResourceType | HealthKitDataType,
  action: string,
  sensitivity?: DataSensitivity
): boolean {
  const delegation = token.caregiverDelegation;
  
  // Check if revoked
  if (delegation.revocationProof) {
    return false;
  }
  
  // Check expiration
  const now = new Date();
  if (delegation.validPeriod.end && now > delegation.validPeriod.end) {
    return false;
  }
  
  // Check action scope
  if (delegation.scope === "read" && action !== "read") {
    return false;
  }
  if (delegation.scope === "emergency-only" && !isEmergencyContext()) {
    return false;
  }
  
  // Check resource type
  const isFhirResource = delegation.allowedFhirResources?.includes(resourceType as FHIRResourceType);
  const isHealthKitType = delegation.allowedHealthKitTypes?.includes(resourceType as HealthKitDataType);
  
  if (!isFhirResource && !isHealthKitType) {
    return false;
  }
  
  // Check sensitivity ceiling (for HealthKit)
  if (sensitivity && !isSensitivityPermitted(sensitivity, delegation.maxSensitivity)) {
    return false;
  }
  
  return true;
}

/**
 * Check if current context is an emergency.
 * In production, this would check system state, vital signs, etc.
 *
 * @returns true if emergency conditions detected
 */
function isEmergencyContext(): boolean {
  // TODO: Implement emergency detection
  // - Check for fall detection
  // - Check vital sign anomalies (heart rate, blood pressure)
  // - Check for manual emergency button press
  return false;
}

/**
 * Check if requested sensitivity level is within permitted ceiling.
 *
 * @param requested - Requested data sensitivity
 * @param ceiling - Maximum permitted sensitivity
 * @returns true if requested <= ceiling
 */
function isSensitivityPermitted(
  requested: DataSensitivity,
  ceiling: DataSensitivity
): boolean {
  const sensitivityLevels: Record<DataSensitivity, number> = {
    PUBLIC: 0,
    PERSONAL: 1,
    RAW: 2,
    MEDICAL: 3,
  };
  
  return sensitivityLevels[requested] <= sensitivityLevels[ceiling];
}

/**
 * Generate human-readable explanation of a Caregiver Delegation Token.
 *
 * @param token - Caregiver Delegation Token
 * @returns Natural language explanation
 *
 * @example
 * ```ts
 * const explanation = explainCaregiverDelegation(delegationToken);
 * // Returns:
 * // "Patient (did:key:elderly_parent...) grants family member (did:key:adult_child...)
 * //  read access to Observation, MedicationRequest, DiagnosticReport
 * //  for up to 30 days. Emergency override enabled."
 * ```
 */
export function explainCaregiverDelegation(token: CaregiverDelegationToken): string {
  const delegation = token.caregiverDelegation;
  
  const delegatorShort = delegation.delegator.substring(0, 25) + "...";
  const delegateShort = delegation.delegate.substring(0, 25) + "...";
  
  const relationshipMap: Record<CaregiverRelationship, string> = {
    "family-member": "family member",
    "professional-nurse": "professional nurse",
    "physician": "physician",
    "therapist": "therapist",
    "home-health-aide": "home health aide",
    "emergency-contact": "emergency contact",
  };
  
  const relationshipStr = relationshipMap[delegation.relationship];
  
  const resourcesStr = [
    ...(delegation.allowedFhirResources ?? []),
    ...(delegation.allowedHealthKitTypes ?? []),
  ].join(", ");
  
  const scopeStr = delegation.scope === "read-write" ? "read and write" : delegation.scope;
  
  const durationStr = delegation.validPeriod.end
    ? `until ${delegation.validPeriod.end.toISOString().split("T")[0]}`
    : "indefinitely (requires renewal)";
  
  const emergencyStr = delegation.emergencyOverride
    ? " Emergency override enabled."
    : "";
  
  const renewalStr = delegation.renewalCount > 0
    ? ` (Renewed ${delegation.renewalCount} time(s))`
    : "";
  
  return `Patient (${delegatorShort}) grants ${relationshipStr} (${delegateShort}) ${scopeStr} access to ${resourcesStr} ${durationStr}.${emergencyStr}${renewalStr}`;
}

/**
 * Get audit log entry for caregiver delegation access.
 * Used by Evidence Ledger to record caregiver access events.
 *
 * @param token - Caregiver Delegation Token
 * @param resource - Resource accessed
 * @param action - Action performed
 * @returns Audit log entry
 */
export function createCaregiverAuditEntry(
  token: CaregiverDelegationToken,
  resource: string,
  action: string
): {
  timestamp: Date;
  delegator: string;
  delegate: string;
  relationship: CaregiverRelationship;
  resource: string;
  action: string;
  scope: AccessScope;
  emergencyOverride: boolean;
} {
  return {
    timestamp: new Date(),
    delegator: token.caregiverDelegation.delegator,
    delegate: token.caregiverDelegation.delegate,
    relationship: token.caregiverDelegation.relationship,
    resource,
    action,
    scope: token.caregiverDelegation.scope,
    emergencyOverride: token.caregiverDelegation.emergencyOverride,
  };
}
