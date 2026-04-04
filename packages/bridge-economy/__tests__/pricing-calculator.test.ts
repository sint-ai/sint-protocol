import { describe, it, expect } from "vitest";
import type { SintRequest } from "@sint/core";
import {
  computeActionCost,
  getBaseCost,
  BASE_TOOL_CALL_COST,
  BASE_CHAT_MESSAGE_COST,
  BASE_CAPSULE_EXEC_COST,
  BASE_ROS2_PUBLISH_COST,
  GLOBAL_MARKUP_MULTIPLIER,
} from "../src/pricing-calculator.js";

function makeRequest(overrides: Partial<SintRequest> = {}): SintRequest {
  return {
    requestId: "req-001",
    timestamp: "2026-03-17T10:00:00.000000Z",
    agentId: "agent-abc",
    tokenId: "token-001",
    resource: "mcp://tool/test",
    action: "call",
    params: {},
    ...overrides,
  };
}

describe("PricingCalculator", () => {
  describe("computeActionCost", () => {
    it("default MCP tool call costs 9 tokens", () => {
      const req = makeRequest();
      const pricing = computeActionCost(req);
      // ceil(6 * 1.0 * 1.5) = 9
      expect(pricing.totalCost).toBe(9);
      expect(pricing.baseCost).toBe(BASE_TOOL_CALL_COST);
    });

    it("chat/message action costs 6 tokens", () => {
      const req = makeRequest({ action: "chat" });
      const pricing = computeActionCost(req);
      // ceil(4 * 1.0 * 1.5) = 6
      expect(pricing.totalCost).toBe(6);
      expect(pricing.baseCost).toBe(BASE_CHAT_MESSAGE_COST);
    });

    it("capsule execution costs 18 tokens", () => {
      const req = makeRequest({ resource: "capsule://my-capsule/run" });
      const pricing = computeActionCost(req);
      // ceil(12 * 1.0 * 1.5) = 18
      expect(pricing.totalCost).toBe(18);
      expect(pricing.baseCost).toBe(BASE_CAPSULE_EXEC_COST);
    });

    it("ROS2 publish costs 12 tokens", () => {
      const req = makeRequest({ resource: "ros2:///cmd_vel" });
      const pricing = computeActionCost(req);
      // ceil(8 * 1.0 * 1.5) = 12
      expect(pricing.totalCost).toBe(12);
      expect(pricing.baseCost).toBe(BASE_ROS2_PUBLISH_COST);
    });

    it("premium MCP with costMultiplier=2.0 costs 18 tokens", () => {
      const req = makeRequest();
      const pricing = computeActionCost(req, 2.0);
      // ceil(6 * 2.0 * 1.5) = 18
      expect(pricing.totalCost).toBe(18);
      expect(pricing.costMultiplier).toBe(2.0);
    });

    it("zero multiplier yields 0 tokens", () => {
      const req = makeRequest();
      const pricing = computeActionCost(req, 0);
      // ceil(6 * 0 * 1.5) = 0
      expect(pricing.totalCost).toBe(0);
    });

    it("fractional multiplier rounds up via ceil", () => {
      const req = makeRequest();
      // ceil(6 * 0.7 * 1.5) = ceil(6.3) = 7
      const pricing = computeActionCost(req, 0.7);
      expect(pricing.totalCost).toBe(7);
    });

    it("PricingInfo has correct breakdown fields", () => {
      const req = makeRequest();
      const pricing = computeActionCost(req, 1.5);
      expect(pricing.baseCost).toBe(BASE_TOOL_CALL_COST);
      expect(pricing.costMultiplier).toBe(1.5);
      expect(pricing.globalMarkup).toBe(GLOBAL_MARKUP_MULTIPLIER);
      // ceil(6 * 1.5 * 1.5) = ceil(13.5) = 14
      expect(pricing.totalCost).toBe(14);
    });
  });

  describe("getBaseCost", () => {
    it("returns BASE_TOOL_CALL_COST for generic MCP action", () => {
      const req = makeRequest({ resource: "mcp://tool/test", action: "call" });
      expect(getBaseCost(req)).toBe(BASE_TOOL_CALL_COST);
    });

    it("returns BASE_CHAT_MESSAGE_COST for message action", () => {
      const req = makeRequest({ action: "message" });
      expect(getBaseCost(req)).toBe(BASE_CHAT_MESSAGE_COST);
    });

    it("returns BASE_CAPSULE_EXEC_COST for capsule_exec action", () => {
      const req = makeRequest({ action: "capsule_exec" });
      expect(getBaseCost(req)).toBe(BASE_CAPSULE_EXEC_COST);
    });

    it("returns BASE_ROS2_PUBLISH_COST for ros2:// resource", () => {
      const req = makeRequest({ resource: "ros2:///joint_states" });
      expect(getBaseCost(req)).toBe(BASE_ROS2_PUBLISH_COST);
    });
  });
});
