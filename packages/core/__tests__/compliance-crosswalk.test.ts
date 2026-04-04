import { describe, it, expect } from "vitest";
import {
  SINT_TIER_COMPLIANCE_CROSSWALK,
  SINT_SCHEMA_CATALOG,
  ApprovalTier,
} from "../src/index.js";

describe("SINT tier compliance crosswalk", () => {
  it("exports one mapping per approval tier", () => {
    const tiers = new Set(SINT_TIER_COMPLIANCE_CROSSWALK.map((entry) => entry.tier));
    expect(tiers).toEqual(new Set([
      ApprovalTier.T0_OBSERVE,
      ApprovalTier.T1_PREPARE,
      ApprovalTier.T2_ACT,
      ApprovalTier.T3_COMMIT,
    ]));
  });

  it("maps each tier to NIST AI RMF, ISO/IEC 42001, and EU AI Act references", () => {
    for (const entry of SINT_TIER_COMPLIANCE_CROSSWALK) {
      const frameworks = new Set(entry.mappings.map((mapping) => mapping.framework));
      expect(frameworks).toEqual(new Set([
        "nist-ai-rmf-1.0",
        "iso-iec-42001-2023",
        "eu-ai-act-2024-1689",
      ]));
    }
  });

  it("publishes a machine-readable schema for crosswalk entries", () => {
    expect(SINT_SCHEMA_CATALOG["tier-compliance-crosswalk"]).toBeDefined();
  });
});
