/**
 * Tests for consumer device profiles and resource mapping.
 */

import { describe, it, expect } from "vitest";
import { ApprovalTier } from "@sint-ai/core";
import {
  CONSUMER_DEVICE_PROFILES,
  getProfileForDomain,
  getTierForService,
  isHumanAware,
} from "../src/consumer-profiles.js";
import {
  parseEntityId,
  mapServiceCallToSint,
  isSafetyCritical,
} from "../src/resource-mapper.js";

describe("Consumer Device Profiles", () => {
  it("should have profiles for all consumer device classes", () => {
    expect(CONSUMER_DEVICE_PROFILES["smart-lock"]).toBeDefined();
    expect(CONSUMER_DEVICE_PROFILES["robot-vacuum"]).toBeDefined();
    expect(CONSUMER_DEVICE_PROFILES["automation"]).toBeDefined();
  });
  
  it("should map smart locks to T2_ACT", () => {
    const profile = getProfileForDomain("lock");
    expect(profile).toBeDefined();
    expect(profile?.defaultTier).toBe(ApprovalTier.T2_ACT);
  });
  
  it("should map robot vacuums to T1_PREPARE with human-aware", () => {
    const profile = getProfileForDomain("vacuum");
    expect(profile).toBeDefined();
    expect(profile?.defaultTier).toBe(ApprovalTier.T1_PREPARE);
    expect(profile?.humanAware).toBe(true);
  });
  
  it("should map automations to T3_COMMIT", () => {
    const tier = getTierForService("automation", "turn_on");
    expect(tier).toBe(ApprovalTier.T3_COMMIT);
  });
  
  it("should identify human-aware devices", () => {
    expect(isHumanAware("vacuum")).toBe(true);
    expect(isHumanAware("lock")).toBe(false);
    expect(isHumanAware("light")).toBe(false);
  });
  
  it("should identify safety-critical devices", () => {
    expect(isSafetyCritical("lock")).toBe(true);
    expect(isSafetyCritical("alarm_control_panel")).toBe(true);
    expect(isSafetyCritical("light")).toBe(false);
  });
});

describe("Resource Mapper", () => {
  it("should parse Home Assistant entity IDs", () => {
    const entity = parseEntityId("lock.front_door");
    expect(entity.domain).toBe("lock");
    expect(entity.objectId).toBe("front_door");
    expect(entity.entityId).toBe("lock.front_door");
  });
  
  it("should handle multi-dot entity IDs", () => {
    const entity = parseEntityId("light.kitchen.ceiling");
    expect(entity.domain).toBe("light");
    expect(entity.objectId).toBe("kitchen.ceiling");
  });
  
  it("should map lock.unlock to T2_ACT", () => {
    const entity = parseEntityId("lock.front_door");
    const mapping = mapServiceCallToSint({ entity, service: "unlock" });
    
    expect(mapping.resource).toBe("ha://homeassistant.local/entity/lock.front_door");
    expect(mapping.action).toBe("unlock");
    expect(mapping.tier).toBe(ApprovalTier.T2_ACT);
  });
  
  it("should map light.turn_on to T1_PREPARE", () => {
    const entity = parseEntityId("light.living_room");
    const mapping = mapServiceCallToSint({ entity, service: "turn_on" });
    
    expect(mapping.resource).toBe("ha://homeassistant.local/entity/light.living_room");
    expect(mapping.action).toBe("turn_on");
    expect(mapping.tier).toBe(ApprovalTier.T1_PREPARE);
  });
  
  it("should include context in mapping", () => {
    const entity = parseEntityId("climate.living_room");
    const mapping = mapServiceCallToSint({
      entity,
      service: "set_temperature",
      serviceData: { temperature: 72 },
    });
    
    expect(mapping.context).toBeDefined();
    expect(mapping.context?.domain).toBe("climate");
    expect(mapping.context?.service).toBe("set_temperature");
    expect(mapping.context?.serviceData).toEqual({ temperature: 72 });
  });
  
  it("should use custom HA host in resource URI", () => {
    const entity = parseEntityId("lock.back_door");
    const mapping = mapServiceCallToSint(
      { entity, service: "lock" },
      "home.example.com"
    );
    
    expect(mapping.resource).toBe("ha://home.example.com/entity/lock.back_door");
  });
});
