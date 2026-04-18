import { describe, expect, it } from "vitest";
import { ApprovalTier } from "@sint-ai/core";
import {
  defaultTierForSparkplug,
  parseSparkplugTopic,
  sparkplugActionForMessageType,
  sparkplugTopicToResourceUri,
  suggestTierForSparkplugTopic,
} from "../src/index.js";

describe("parseSparkplugTopic", () => {
  it("parses standard Sparkplug command topic", () => {
    const parsed = parseSparkplugTopic("spBv1.0/warehouse/DCMD/edge-1/robot-7");
    expect(parsed).toEqual({
      namespace: "spBv1.0",
      groupId: "warehouse",
      messageType: "DCMD",
      edgeNodeId: "edge-1",
      deviceId: "robot-7",
    });
  });

  it("parses STATE topic", () => {
    const parsed = parseSparkplugTopic("spBv1.0/STATE/gateway-1");
    expect(parsed).toEqual({
      namespace: "spBv1.0",
      groupId: "_state",
      messageType: "STATE",
      edgeNodeId: "gateway-1",
    });
  });

  it("returns undefined for non-sparkplug topic", () => {
    expect(parseSparkplugTopic("factory/DCMD/edge-1/device")).toBeUndefined();
  });
});

describe("sparkplugTopicToResourceUri", () => {
  it("maps command topic to canonical URI", () => {
    expect(
      sparkplugTopicToResourceUri("spBv1.0/warehouse/DCMD/edge-1/robot-7"),
    ).toBe("mqtt-sparkplug:///warehouse/edge-1/robot-7/dcmd");
  });

  it("maps STATE topic to canonical URI", () => {
    expect(
      sparkplugTopicToResourceUri("spBv1.0/STATE/gateway-1"),
    ).toBe("mqtt-sparkplug:///_state/gateway-1/state");
  });
});

describe("sparkplug action/tier mapping", () => {
  it("maps DCMD to call and T2", () => {
    expect(sparkplugActionForMessageType("DCMD")).toBe("call");
    expect(defaultTierForSparkplug("DCMD")).toBe(ApprovalTier.T2_ACT);
  });

  it("maps NDATA to publish and T0", () => {
    expect(sparkplugActionForMessageType("NDATA")).toBe("publish");
    expect(defaultTierForSparkplug("NDATA")).toBe(ApprovalTier.T0_OBSERVE);
  });

  it("promotes safety-critical command topics to T3", () => {
    expect(
      suggestTierForSparkplugTopic("spBv1.0/warehouse/DCMD/edge-1/robot-7/emergency-stop"),
    ).toBe(ApprovalTier.T3_COMMIT);
  });
});
