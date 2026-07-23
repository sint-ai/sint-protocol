/**
 * SINT bridge-health — regulated runtime metadata helpers.
 *
 * Builds the `params.regulatedData` payload consumed by the policy gateway's
 * regulated-data runtime policy. Enforcement stays in PolicyGateway.intercept().
 */

import type { RegulatedDataRequestMetadata } from "@pshkv/gate-policy-gateway";
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
