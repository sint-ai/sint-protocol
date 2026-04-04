import { describe, it, expect } from "vitest";
import { ApprovalTier } from "@sint/core";
import {
  mapTrustLevelToApprovalTier,
  mergedTier,
  wouldEscalate,
} from "../src/trust-tier-mapper.js";

describe("TrustTierMapper", () => {
  describe("mapTrustLevelToApprovalTier", () => {
    it("maps unrestricted to T0_OBSERVE", () => {
      expect(mapTrustLevelToApprovalTier("unrestricted")).toBe(ApprovalTier.T0_OBSERVE);
    });

    it("maps low_risk to T1_PREPARE", () => {
      expect(mapTrustLevelToApprovalTier("low_risk")).toBe(ApprovalTier.T1_PREPARE);
    });

    it("maps medium_risk to T2_ACT", () => {
      expect(mapTrustLevelToApprovalTier("medium_risk")).toBe(ApprovalTier.T2_ACT);
    });

    it("maps high_risk to T3_COMMIT", () => {
      expect(mapTrustLevelToApprovalTier("high_risk")).toBe(ApprovalTier.T3_COMMIT);
    });

    it("maps blocked to null", () => {
      expect(mapTrustLevelToApprovalTier("blocked")).toBeNull();
    });
  });

  describe("mergedTier", () => {
    it("returns the higher tier when trust is more restrictive", () => {
      const result = mergedTier(ApprovalTier.T0_OBSERVE, ApprovalTier.T3_COMMIT);
      expect(result).toBe(ApprovalTier.T3_COMMIT);
    });

    it("returns the security tier when it is already higher", () => {
      const result = mergedTier(ApprovalTier.T3_COMMIT, ApprovalTier.T0_OBSERVE);
      expect(result).toBe(ApprovalTier.T3_COMMIT);
    });
  });

  describe("wouldEscalate", () => {
    it("returns true when trust tier is more restrictive than security tier", () => {
      expect(wouldEscalate(ApprovalTier.T0_OBSERVE, ApprovalTier.T3_COMMIT)).toBe(true);
    });

    it("returns false when trust tier is less restrictive than security tier", () => {
      expect(wouldEscalate(ApprovalTier.T3_COMMIT, ApprovalTier.T0_OBSERVE)).toBe(false);
    });
  });
});
