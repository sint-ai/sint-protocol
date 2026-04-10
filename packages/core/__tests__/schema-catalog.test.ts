import { describe, expect, it } from "vitest";
import { SINT_SCHEMA_CATALOG } from "../src/constants/schema-catalog.js";

describe("schema catalog request contract", () => {
  it("exposes executionContext with verifiable and hardware safety blocks", () => {
    const requestSchema = SINT_SCHEMA_CATALOG.request as Record<string, unknown>;
    const requestProperties = requestSchema.properties as Record<string, unknown>;
    const executionContext = requestProperties.executionContext as Record<string, unknown>;
    const executionContextProperties = executionContext.properties as Record<string, unknown>;

    expect(executionContextProperties.attestation).toBeDefined();
    expect(executionContextProperties.verifiableCompute).toBeDefined();
    expect(executionContextProperties.hardwareSafety).toBeDefined();
    expect(executionContextProperties.preapprovedCorridor).toBeDefined();
  });

  it("exposes constraint language v1 envelope groups with legacy aliases", () => {
    const envelopeSchema = SINT_SCHEMA_CATALOG["constraint-envelope"] as Record<string, unknown>;
    const properties = envelopeSchema.properties as Record<string, unknown>;

    expect(properties.version).toBeDefined();
    expect(properties.mode).toBeDefined();
    expect(properties.physical).toBeDefined();
    expect(properties.behavioral).toBeDefined();
    expect(properties.model).toBeDefined();
    expect(properties.attestation).toBeDefined();
    expect(properties.dynamic).toBeDefined();
    expect(properties.execution).toBeDefined();

    // Legacy aliases remain available for backward compatibility.
    expect(properties.corridorId).toBeDefined();
    expect(properties.maxDeviationMeters).toBeDefined();
  });
});
