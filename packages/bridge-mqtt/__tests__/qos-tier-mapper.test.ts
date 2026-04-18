import { describe, expect, it } from "vitest";

import {
  DEFAULT_SMART_HOME_RULES,
  createMQTTMessage,
  mapQoSToTier,
  mapTierToQoS,
  matchTopicToTier,
} from "../src/qos-tier-mapper.js";
import { ApprovalTier } from "@pshkv/core";

describe("bridge-mqtt qos-tier-mapper", () => {
  it("maps QoS -> ApprovalTier (happy path)", () => {
    expect(mapQoSToTier(0)).toBe(ApprovalTier.T0_OBSERVE);
    expect(mapQoSToTier(1)).toBe(ApprovalTier.T1_PREPARE);
    expect(mapQoSToTier(2)).toBe(ApprovalTier.T2_ACT);
  });

  it("maps ApprovalTier -> QoS (inverse mapping)", () => {
    expect(mapTierToQoS(ApprovalTier.T0_OBSERVE)).toBe(0);
    expect(mapTierToQoS(ApprovalTier.T1_PREPARE)).toBe(1);
    expect(mapTierToQoS(ApprovalTier.T2_ACT)).toBe(2);
    expect(mapTierToQoS(ApprovalTier.T3_COMMIT)).toBe(2);
  });

  it("matches MQTT topic rules with wildcards", () => {
    const tier = matchTopicToTier("home/living_room/lock/front_door", DEFAULT_SMART_HOME_RULES, 0);
    expect(tier).toBe(ApprovalTier.T2_ACT);
  });

  it("creates message envelope with tier derived from topic rules", () => {
    const msg = createMQTTMessage(
      "home/bedroom/light/ceiling",
      "on",
      1,
      DEFAULT_SMART_HOME_RULES,
      false,
    );
    expect(msg.qos).toBe(1);
    expect(msg.tier).toBe(ApprovalTier.T1_PREPARE);
  });
});

