/**
 * SINT bridge-health — FHIR Consent Token
 *
 * Implements FHIR R5 Consent resource as a SINT capability token extension.
 * Provides cryptographic consent enforcement for health data access.
 *
 * @module @pshkv/bridge-health/fhir-consent-token
 */

import type { CapabilityToken } from "@pshkv/gate-capability-tokens";
import { ApprovalTier } from "@pshkv/core";
import type { FHIRResourceType } from "./fhir-mapper.js";

/**
 * FHIR Consent provision decision (FHIR R5).
 */
export type ConsentProvision = "permit" | "deny";

/**
 * FHIR Consent scope (what kind of consent this is).
 */
export type ConsentScope =
  | "patient-privacy"     // Privacy consent
  | "research"            // Research participation
  | "treatment"           // Treatment consent
  | "advance-directive";  // Advance care directive

/**
 * FHIR Consent category (granular consent types).
 */
export type ConsentCategory =
  | "INFA"   // Information access
  | "INFASO" // Information access with security obligations
  | "INFASO-WY" // Access with "write yourself" privilege
  | "RESEARCH" // Research
  | "TREAT";   // Treatment

/**
 * FHIR Consent extension for SINT capability tokens.
 *
 * Based on FHIR R5 Consent resource:
 * https://hl7.org/fhir/R5/consent.html
 */
export interface FHIRConsentExtension {
  /** Reference to FHIR Consent resource (if stored in EHR) */
  consentId?: string;
  
  /** Patient DID (data subject) */
  grantor: string;
  
  /** Agent/caregiver DID (data accessor) */
  grantee: string;
  
  /** Consent scope */
  scope: ConsentScope;
  
  /** Consent category */
  category: ConsentCategory;
  
  /** Provision (permit or deny) */
  provision: ConsentProvision;
  
  /** FHIR resource types covered by this consent */
  resourceTypes: FHIRResourceType[];
  
  /** Specific resource IDs (optional, for fine-grained consent) */
  resourceIds?: string[];
  
  /** Actions permitted (read, create, update, delete) */
  actions: string[];
  
  /** Time period for consent validity */
  period: {
    start: Date;
    end?: Date; // undefined = indefinite
  };
  
  /** Purpose of use codes (optional) */
  purposeOfUse?: string[];
  
  /** Security labels (optional, for additional access control) */
  securityLabels?: string[];
}

/**
 * FHIR Consent Token = SINT Capability Token + FHIR Consent Extension.
 */
export interface FHIRConsentToken extends CapabilityToken {
  fhirConsent: FHIRConsentExtension;
}

/**
 * Create a FHIR Consent Token for health data access.
 *
 * @param grantor - Patient DID (data owner)
 * @param grantee - Agent/caregiver DID (data accessor)
 * @param resourceTypes - FHIR resource types permitted
 * @param actions - Actions permitted (read, create, update, delete)
 * @param validUntil - Token expiration (default: 30 days)
 * @param options - Additional consent options
 * @returns FHIR Consent Token for Policy Gateway
 *
 * @example
 * ```ts
 * // Patient grants AI agent read access to Observations for 7 days
 * const consentToken = createFHIRConsentToken(
 *   'did:key:patient123',
 *   'did:key:aiagent456',
 *   ['Observation', 'DiagnosticReport'],
 *   ['read'],
 *   new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
 *   {
 *     scope: 'patient-privacy',
 *     category: 'INFA',
 *     purposeOfUse: ['TREAT'], // Treatment purpose
 *   }
 * );
 * ```
 */
export function createFHIRConsentToken(
  grantor: string,
  grantee: string,
  resourceTypes: FHIRResourceType[],
  actions: string[],
  validUntil?: Date,
  options?: {
    scope?: ConsentScope;
    category?: ConsentCategory;
    purposeOfUse?: string[];
    resourceIds?: string[];
    consentId?: string;
  }
): Partial<FHIRConsentToken> {
  const now = new Date();
  const expiresAt = validUntil ?? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days default
  
  // Determine tier based on resource types
  // Medical resources (MedicationRequest, Consent) require T2
  const medicalResources: FHIRResourceType[] = ["MedicationRequest", "Consent"];
  const requiresT2 = resourceTypes.some(rt => medicalResources.includes(rt));
  const tier = requiresT2 ? ApprovalTier.T2_ACT : ApprovalTier.T1_PREPARE;
  
  return {
    subject: grantee,
    resource: `fhir://*/${resourceTypes.join(",")}`, // Wildcard for multiple resource types
    actions,
    tier,
    issuedAt: now,
    expiresAt,
    fhirConsent: {
      consentId: options?.consentId,
      grantor,
      grantee,
      scope: options?.scope ?? "patient-privacy",
      category: options?.category ?? "INFA",
      provision: "permit",
      resourceTypes,
      resourceIds: options?.resourceIds,
      actions,
      period: {
        start: now,
        end: expiresAt,
      },
      purposeOfUse: options?.purposeOfUse,
    },
  };
}

/**
 * Check if a FHIR access request matches a consent token.
 *
 * @param token - FHIR Consent Token
 * @param resourceType - Resource type being accessed
 * @param action - Action being performed
 * @param resourceId - Specific resource ID (optional)
 * @returns true if consent permits this access
 */
export function matchesFHIRConsent(
  token: FHIRConsentToken,
  resourceType: FHIRResourceType,
  action: string,
  resourceId?: string
): boolean {
  const consent = token.fhirConsent;
  
  // Check provision (deny overrides everything)
  if (consent.provision === "deny") {
    return false;
  }
  
  // Check expiration
  const now = new Date();
  if (consent.period.end && now > consent.period.end) {
    return false;
  }
  
  // Check resource type
  if (!consent.resourceTypes.includes(resourceType)) {
    return false;
  }
  
  // Check action
  if (!consent.actions.includes(action)) {
    return false;
  }
  
  // Check specific resource ID if provided
  if (resourceId && consent.resourceIds && consent.resourceIds.length > 0) {
    if (!consent.resourceIds.includes(resourceId)) {
      return false;
    }
  }
  
  return true;
}

/**
 * Revoke a FHIR Consent Token.
 * Generates cryptographic proof of revocation.
 *
 * @param token - FHIR Consent Token to revoke
 * @param revokedBy - DID of entity revoking consent (typically grantor)
 * @returns Revocation proof (signed timestamp)
 */
export async function revokeFHIRConsent(
  token: FHIRConsentToken,
  revokedBy: string
): Promise<{
  tokenId: string;
  revokedBy: string;
  revokedAt: Date;
  proof: string; // Cryptographic signature (Ed25519)
}> {
  const revokedAt = new Date();
  
  // Create revocation payload
  const payload = {
    tokenId: token.id ?? "",
    revokedBy,
    revokedAt: revokedAt.toISOString(),
  };
  
  // TODO: Sign with revokedBy's private key (Ed25519)
  // For now, return placeholder proof
  const proof = Buffer.from(JSON.stringify(payload)).toString("base64");
  
  return {
    tokenId: token.id ?? "",
    revokedBy,
    revokedAt,
    proof,
  };
}

/**
 * Generate human-readable explanation of a FHIR Consent Token.
 *
 * @param token - FHIR Consent Token
 * @returns Natural language explanation
 *
 * @example
 * ```ts
 * const explanation = explainFHIRConsent(consentToken);
 * // Returns:
 * // "Patient (did:key:patient123) grants AI Agent (did:key:aiagent456)
 * //  permission to read Observation and DiagnosticReport resources
 * //  for treatment purposes until 2026-04-25."
 * ```
 */
export function explainFHIRConsent(token: FHIRConsentToken): string {
  const consent = token.fhirConsent;
  
  const grantorShort = consent.grantor.substring(0, 20) + "...";
  const granteeShort = consent.grantee.substring(0, 20) + "...";
  
  const resourcesStr = consent.resourceTypes.join(", ");
  const actionsStr = consent.actions.join(", ");
  
  const purposeStr = consent.purposeOfUse?.join(", ") ?? "general use";
  
  const endStr = consent.period.end
    ? `until ${consent.period.end.toISOString().split("T")[0]}`
    : "indefinitely";
  
  return `Patient (${grantorShort}) grants ${granteeShort} permission to ${actionsStr} ${resourcesStr} resources for ${purposeStr} ${endStr}.`;
}
