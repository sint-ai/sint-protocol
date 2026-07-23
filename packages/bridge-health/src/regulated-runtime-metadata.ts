/**
 * SINT bridge-health — regulated runtime metadata helpers.
 *
 * Builds the `params.regulatedData` payload consumed by the policy gateway's
 * regulated-data runtime policy. Enforcement stays in PolicyGateway.intercept().
 */

import type { RegulatedDataRequestMetadata } from "@pshkv/gate-policy-gateway";
import type { SintRegulatedDataPolicy } from "@pshkv/core";
import type { FHIRResourceMapping, FHIRResourceType } from "./fhir-mapper.js";

export interface RegulatedRuntimeRouteContext {
  readonly purposeOfUse: string;
  readonly processor: string;
  readonly region: string;
  readonly model: string;
  readonly requestedContextFields?: readonly string[];
  readonly fallback?: RegulatedDataRequestMetadata["fallback"];
}

export interface RegulatedRuntimeParams {
  readonly regulatedData: RegulatedDataRequestMetadata;
}

export interface FHIRRegulatedDataPolicyOptions {
  readonly allowedPurposes: readonly string[];
  readonly approvedProcessors: readonly string[];
  readonly approvedRegions: readonly string[];
  readonly approvedModels: readonly string[];
  readonly allowedContextFields?: readonly string[];
  readonly allowFallback?: boolean;
}

const CLINICAL_PHI_RESOURCES = new Set<FHIRResourceType>([
  "Observation",
  "Condition",
  "MedicationRequest",
  "MedicationStatement",
  "AllergyIntolerance",
  "Immunization",
  "DiagnosticReport",
  "DocumentReference",
  "Encounter",
  "Procedure",
  "CarePlan",
  "Goal",
]);

/**
 * Build regulated runtime metadata from an existing FHIR-to-SINT mapping.
 */
export function buildFHIRRegulatedRuntimeMetadata(
  mapping: FHIRResourceMapping,
  route: RegulatedRuntimeRouteContext,
): RegulatedDataRequestMetadata {
  return {
    dataClasses: classifyFHIRDataClasses(mapping.context.resourceType),
    purposeOfUse: route.purposeOfUse,
    processor: route.processor,
    region: route.region,
    model: route.model,
    requestedContextFields: route.requestedContextFields ?? defaultContextFields(mapping),
    ...(route.fallback && { fallback: route.fallback }),
  };
}

/**
 * Build a token-bound regulated data policy from a FHIR mapping.
 *
 * Use this as `SintCapabilityTokenRequest.regulatedDataPolicy` so token
 * authority and request metadata are derived from the same bridge mapping.
 */
export function buildFHIRRegulatedDataPolicy(
  mapping: FHIRResourceMapping,
  options: FHIRRegulatedDataPolicyOptions,
): SintRegulatedDataPolicy {
  return {
    allowedDataClasses: classifyFHIRDataClasses(mapping.context.resourceType),
    allowedPurposes: options.allowedPurposes,
    approvedProcessors: options.approvedProcessors,
    approvedRegions: options.approvedRegions,
    approvedModels: options.approvedModels,
    allowedContextFields: options.allowedContextFields ?? defaultContextFields(mapping),
    allowFallback: options.allowFallback,
  };
}

/**
 * Attach regulated metadata under `params.regulatedData` while preserving any
 * bridge-specific params already present.
 */
export function withRegulatedRuntimeParams(
  params: Record<string, unknown>,
  metadata: RegulatedDataRequestMetadata,
): Record<string, unknown> & RegulatedRuntimeParams {
  return {
    ...params,
    regulatedData: metadata,
  };
}

export function classifyFHIRDataClasses(
  resourceType: FHIRResourceType,
): readonly ("PHI" | "PII" | "ADMIN")[] {
  if (resourceType === "Patient") {
    return ["PHI", "PII"];
  }
  if (resourceType === "Consent") {
    return ["PII", "ADMIN"];
  }
  if (CLINICAL_PHI_RESOURCES.has(resourceType)) {
    return ["PHI"];
  }
  return ["ADMIN"];
}

function defaultContextFields(mapping: FHIRResourceMapping): readonly string[] {
  const fields = [
    "resourceType",
    "interaction",
    mapping.context.resourceId ? "resourceId" : undefined,
    mapping.context.patientId ? "patientId" : undefined,
  ];
  return fields.filter((field): field is string => field !== undefined);
}
