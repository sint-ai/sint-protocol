/**
 * Regulated runtime metadata helpers.
 */

import { describe, expect, it } from "vitest";
import { ApprovalTier } from "@pshkv/core";
import { DefaultRegulatedDataPolicyPlugin } from "@pshkv/gate-policy-gateway";
import {
  generateKeypair,
  issueCapabilityToken,
} from "@pshkv/gate-capability-tokens";
import {
  buildFHIRRegulatedDataPolicy,
  buildFHIRRegulatedRuntimeMetadata,
  classifyFHIRDataClasses,
  withRegulatedRuntimeParams,
} from "../src/regulated-runtime-metadata.js";
import { mapFHIRToSint } from "../src/fhir-mapper.js";

describe("regulated runtime metadata", () => {
  it("classifies patient, clinical, and consent resources", () => {
    expect(classifyFHIRDataClasses("Patient")).toEqual(["PHI", "PII"]);
    expect(classifyFHIRDataClasses("Observation")).toEqual(["PHI"]);
    expect(classifyFHIRDataClasses("Consent")).toEqual(["PII", "ADMIN"]);
  });

  it("builds PolicyGateway regulated-data metadata from a FHIR mapping", () => {
    const mapping = mapFHIRToSint({
      serverUrl: "https://fhir.example.test",
      resourceType: "Observation",
      resourceId: "obs-123",
      interaction: "read",
      patientId: "patient-456",
    });

    const metadata = buildFHIRRegulatedRuntimeMetadata(mapping, {
      purposeOfUse: "TREAT",
      processor: "in-region-model-router",
      region: "us-east-1",
      model: "clinical-summary-local",
    });

    expect(metadata).toEqual({
      dataClasses: ["PHI"],
      purposeOfUse: "TREAT",
      processor: "in-region-model-router",
      region: "us-east-1",
      model: "clinical-summary-local",
      requestedContextFields: [
        "resourceType",
        "interaction",
        "resourceId",
        "patientId",
      ],
    });
  });

  it("preserves bridge params while attaching regulated metadata", () => {
    const mapping = mapFHIRToSint({
      serverUrl: "https://fhir.example.test",
      resourceType: "Patient",
      resourceId: "patient-456",
      interaction: "read",
      patientId: "patient-456",
    });
    const metadata = buildFHIRRegulatedRuntimeMetadata(mapping, {
      purposeOfUse: "TREAT",
      processor: "ehr-core",
      region: "us-east-1",
      model: "clinical-summary-local",
      requestedContextFields: ["name", "date_of_birth"],
    });

    const params = withRegulatedRuntimeParams(
      { fhirInteraction: mapping.context.interaction },
      metadata,
    );

    expect(params.fhirInteraction).toBe("read");
    expect(params.regulatedData).toBe(metadata);
  });

  it("builds token-bound regulated data policy from the same FHIR mapping", () => {
    const mapping = mapFHIRToSint({
      serverUrl: "https://fhir.example.test",
      resourceType: "Observation",
      resourceId: "obs-123",
      interaction: "read",
      patientId: "patient-456",
    });

    const tokenPolicy = buildFHIRRegulatedDataPolicy(mapping, {
      allowedPurposes: ["TREAT"],
      approvedProcessors: ["in-region-model-router"],
      approvedRegions: ["us-east-1"],
      approvedModels: ["clinical-summary-local"],
      allowFallback: false,
    });

    expect(tokenPolicy).toEqual({
      allowedDataClasses: ["PHI"],
      allowedPurposes: ["TREAT"],
      approvedProcessors: ["in-region-model-router"],
      approvedRegions: ["us-east-1"],
      approvedModels: ["clinical-summary-local"],
      allowedContextFields: [
        "resourceType",
        "interaction",
        "resourceId",
        "patientId",
      ],
      allowFallback: false,
    });
  });

  it("emits metadata compatible with the gateway regulated-data policy", () => {
    const mapping = mapFHIRToSint({
      serverUrl: "https://fhir.example.test",
      resourceType: "Observation",
      resourceId: "obs-123",
      interaction: "read",
      patientId: "patient-456",
    });
    const metadata = buildFHIRRegulatedRuntimeMetadata(mapping, {
      purposeOfUse: "TREAT",
      processor: "external-processor",
      region: "eu-central-1",
      model: "general-model",
      fallback: {
        processor: "in-region-model-router",
        region: "us-east-1",
        model: "clinical-summary-local",
        transformations: ["redact_direct_identifiers", "route_to_approved_region"],
      },
    });
    const policy = new DefaultRegulatedDataPolicyPlugin({
      approvedProcessors: ["in-region-model-router"],
      approvedRegions: ["us-east-1"],
      approvedModels: ["clinical-summary-local"],
      allowedPurposes: ["TREAT"],
    });

    const decision = policy.evaluate(
      {
        requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e50001" as any,
        timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
        agentId: "agent" as any,
        tokenId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e50002" as any,
        resource: mapping.resource,
        action: mapping.action,
        params: withRegulatedRuntimeParams({}, metadata),
      },
      {
        tokenId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e50002" as any,
        issuer: "issuer" as any,
        subject: "agent" as any,
        resource: mapping.resource,
        actions: [mapping.action],
        constraints: {},
        delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
        issuedAt: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
        expiresAt: new Date(Date.now() + 60_000).toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
        revocable: false,
        signature: "signature" as any,
      },
      {
        requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e50001",
        timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
      },
    );

    expect(decision?.action).toBe("transform");
    expect(decision?.assignedTier).toBe(ApprovalTier.T2_ACT);
    expect(decision?.transformations?.additionalAuditFields).toEqual(
      expect.objectContaining({
        fallbackProcessor: "in-region-model-router",
        fallbackRegion: "us-east-1",
        fallbackModel: "clinical-summary-local",
      }),
    );
  });

  it("uses generated token policy to bind issued token authority", () => {
    const issuer = generateKeypair();
    const subject = generateKeypair();
    const mapping = mapFHIRToSint({
      serverUrl: "https://fhir.example.test",
      resourceType: "Observation",
      resourceId: "obs-123",
      interaction: "read",
      patientId: "patient-456",
    });
    const tokenPolicy = buildFHIRRegulatedDataPolicy(mapping, {
      allowedPurposes: ["TREAT"],
      approvedProcessors: ["in-region-model-router"],
      approvedRegions: ["us-east-1"],
      approvedModels: ["clinical-summary-local"],
      allowedContextFields: ["resourceType", "interaction"],
      allowFallback: false,
    });
    const issued = issueCapabilityToken(
      {
        issuer: issuer.publicKey,
        subject: subject.publicKey,
        resource: mapping.resource,
        actions: [mapping.action],
        constraints: {},
        regulatedDataPolicy: tokenPolicy,
        delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
        expiresAt: new Date(Date.now() + 60_000).toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
        revocable: true,
      },
      issuer.privateKey,
    );
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const metadata = buildFHIRRegulatedRuntimeMetadata(mapping, {
      purposeOfUse: "TREAT",
      processor: "in-region-model-router",
      region: "us-east-1",
      model: "clinical-summary-local",
      requestedContextFields: ["resourceType", "interaction", "patientId"],
    });
    const policy = new DefaultRegulatedDataPolicyPlugin({
      approvedProcessors: ["in-region-model-router"],
      approvedRegions: ["us-east-1"],
      approvedModels: ["clinical-summary-local"],
      allowedPurposes: ["TREAT"],
    });
    const decision = policy.evaluate(
      {
        requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e50003" as any,
        timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
        agentId: subject.publicKey,
        tokenId: issued.value.tokenId,
        resource: mapping.resource,
        action: mapping.action,
        params: withRegulatedRuntimeParams({}, metadata),
      },
      issued.value,
      {
        requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e50003",
        timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
      },
    );

    expect(decision?.action).toBe("transform");
    expect(decision?.transformations?.additionalAuditFields).toEqual(
      expect.objectContaining({
        transformations: ["minimize_context"],
        effectiveContextFields: ["resourceType", "interaction"],
        minimizedFields: ["patientId"],
      }),
    );
  });
});
