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
});
