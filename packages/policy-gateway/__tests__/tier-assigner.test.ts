/**
 * SINT Protocol — Tier Assignment Engine unit tests.
 *
 * Tests the pure function that maps requests to approval tiers.
 */

import { describe, it, expect } from "vitest";
import { assignTier } from "../src/tier-assigner.js";
import { ApprovalTier, RiskTier } from "@sint/core";
import type { SintRequest } from "@sint/core";

function makeRequest(overrides: Partial<SintRequest>): SintRequest {
  return {
    requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
    timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
    agentId: "a".repeat(64),
    tokenId: "01905f7c-0000-7000-8000-000000000000",
    resource: "ros2:///cmd_vel",
    action: "publish",
    params: {},
    ...overrides,
  };
}

describe("assignTier", () => {
  it("maps camera subscribe to T0_OBSERVE", () => {
    const result = assignTier(makeRequest({
      resource: "ros2:///camera/front",
      action: "subscribe",
    }));

    expect(result.approvalTier).toBe(ApprovalTier.T0_OBSERVE);
    expect(result.riskTier).toBe(RiskTier.T0_READ);
  });

  it("maps sensor subscribe to T0_OBSERVE", () => {
    const result = assignTier(makeRequest({
      resource: "ros2:///sensor/imu",
      action: "subscribe",
    }));

    expect(result.approvalTier).toBe(ApprovalTier.T0_OBSERVE);
  });

  it("maps plan publish to T1_PREPARE", () => {
    const result = assignTier(makeRequest({
      resource: "ros2:///plan",
      action: "publish",
    }));

    expect(result.approvalTier).toBe(ApprovalTier.T1_PREPARE);
    expect(result.riskTier).toBe(RiskTier.T1_WRITE_LOW);
  });

  it("maps cmd_vel publish to T2_ACT", () => {
    const result = assignTier(makeRequest({
      resource: "ros2:///cmd_vel",
      action: "publish",
    }));

    expect(result.approvalTier).toBe(ApprovalTier.T2_ACT);
    expect(result.riskTier).toBe(RiskTier.T2_STATEFUL);
  });

  it("maps mode_change call to T3_COMMIT", () => {
    const result = assignTier(makeRequest({
      resource: "ros2:///mode_change",
      action: "call",
    }));

    expect(result.approvalTier).toBe(ApprovalTier.T3_COMMIT);
    expect(result.riskTier).toBe(RiskTier.T3_IRREVERSIBLE);
  });

  it("maps generic MCP call to T1_PREPARE", () => {
    const result = assignTier(makeRequest({
      resource: "mcp://server/tool",
      action: "call",
    }));

    expect(result.approvalTier).toBe(ApprovalTier.T1_PREPARE);
  });

  it("maps financial MCP trade to T3_COMMIT", () => {
    const result = assignTier(makeRequest({
      resource: "mcp://server/trade.execute",
      action: "call",
    }));

    expect(result.approvalTier).toBe(ApprovalTier.T3_COMMIT);
  });

  it("escalates on human presence detection", () => {
    const result = assignTier(makeRequest({
      resource: "ros2:///cmd_vel",
      action: "publish",
      physicalContext: { humanDetected: true },
    }));

    // T2_ACT escalated to T3_COMMIT due to human presence
    expect(result.approvalTier).toBe(ApprovalTier.T3_COMMIT);
    expect(result.escalationReasons).toContain("Human detected in workspace");
  });

  it("escalates untrusted agent on MCP call", () => {
    const result = assignTier(
      makeRequest({
        resource: "mcp://server/tool",
        action: "call",
      }),
      { agentTrustLevel: "untrusted" },
    );

    // T1_PREPARE escalated to T2_ACT for untrusted agent
    expect(result.approvalTier).toBe(ApprovalTier.T2_ACT);
    expect(result.escalationReasons).toContain("Agent trust level is below TRUSTED");
  });

  it("escalates to T2_ACT minimum when physical force context present", () => {
    const result = assignTier(makeRequest({
      resource: "ros2:///plan",
      action: "publish",
      physicalContext: { currentForceNewtons: 10 },
    }));

    // T1_PREPARE escalated to T2_ACT due to physical force context
    expect(result.approvalTier).toBe(ApprovalTier.T2_ACT);
    expect(result.escalationReasons).toContain("Physical force context present");
  });

  it("defaults to T1_PREPARE for unknown resources", () => {
    const result = assignTier(makeRequest({
      resource: "unknown://resource",
      action: "call",
    }));

    expect(result.approvalTier).toBe(ApprovalTier.T1_PREPARE);
  });

  it("uses custom rules when provided", () => {
    const customRules = [{
      resourcePattern: "custom://test",
      actions: ["call"],
      baseTier: ApprovalTier.T0_OBSERVE,
      baseRisk: RiskTier.T0_READ,
    }];

    const result = assignTier(
      makeRequest({ resource: "custom://test", action: "call" }),
      { rules: customRules },
    );

    expect(result.approvalTier).toBe(ApprovalTier.T0_OBSERVE);
  });
});
