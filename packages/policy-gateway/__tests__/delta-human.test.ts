/**
 * Tests for Δ_human occupancy plugin (Phase 2).
 */

import { describe, it, expect } from "vitest";
import { ApprovalTier } from "@pshkv/core";
import {
  indicatesHumanPresence,
  matchesPattern,
  isPhysicalActuatorResource,
  escalateTier,
  type OccupancyState,
} from "../src/plugins/delta-human.js";

describe("Δ_human Occupancy Plugin", () => {
  describe("indicatesHumanPresence", () => {
    it("should detect person.* entities at home", () => {
      const state: OccupancyState = {
        entityId: "person.alice",
        state: "home",
        lastUpdated: new Date(),
      };
      expect(indicatesHumanPresence(state)).toBe(true);
    });
    
    it("should not detect person.* entities away", () => {
      const state: OccupancyState = {
        entityId: "person.bob",
        state: "away",
        lastUpdated: new Date(),
      };
      expect(indicatesHumanPresence(state)).toBe(false);
    });
    
    it("should detect device_tracker.* at home", () => {
      const state: OccupancyState = {
        entityId: "device_tracker.alice_phone",
        state: "home",
        lastUpdated: new Date(),
      };
      expect(indicatesHumanPresence(state)).toBe(true);
    });
    
    it("should detect binary_sensor.*_motion when on", () => {
      const state: OccupancyState = {
        entityId: "binary_sensor.kitchen_motion",
        state: "on",
        lastUpdated: new Date(),
      };
      expect(indicatesHumanPresence(state)).toBe(true);
    });
    
    it("should not detect binary_sensor.*_motion when off", () => {
      const state: OccupancyState = {
        entityId: "binary_sensor.living_room_motion",
        state: "off",
        lastUpdated: new Date(),
      };
      expect(indicatesHumanPresence(state)).toBe(false);
    });
    
    it("should detect binary_sensor.*_occupancy when on", () => {
      const state: OccupancyState = {
        entityId: "binary_sensor.bedroom_occupancy",
        state: "on",
        lastUpdated: new Date(),
      };
      expect(indicatesHumanPresence(state)).toBe(true);
    });
  });
  
  describe("matchesPattern", () => {
    it("should match exact entity IDs", () => {
      expect(matchesPattern("person.alice", "person.alice")).toBe(true);
    });
    
    it("should match wildcard patterns", () => {
      expect(matchesPattern("person.alice", "person.*")).toBe(true);
      expect(matchesPattern("person.bob", "person.*")).toBe(true);
      expect(matchesPattern("device_tracker.alice_phone", "device_tracker.*")).toBe(true);
    });
    
    it("should match partial wildcards", () => {
      expect(matchesPattern("binary_sensor.kitchen_motion", "binary_sensor.*_motion")).toBe(true);
      expect(matchesPattern("binary_sensor.living_room_motion", "binary_sensor.*_motion")).toBe(true);
    });
    
    it("should not match non-matching patterns", () => {
      expect(matchesPattern("person.alice", "device_tracker.*")).toBe(false);
      expect(matchesPattern("light.living_room", "person.*")).toBe(false);
    });
  });
  
  describe("isPhysicalActuatorResource", () => {
    it("should identify HA locks as physical actuators", () => {
      expect(isPhysicalActuatorResource("ha://home/lock.front_door")).toBe(true);
      expect(isPhysicalActuatorResource("ha://home/entity/lock.back_door")).toBe(true);
    });
    
    it("should identify HA vacuums as physical actuators", () => {
      expect(isPhysicalActuatorResource("ha://home/vacuum.roomba")).toBe(true);
      expect(isPhysicalActuatorResource("ha://home/entity/vacuum.kitchen")).toBe(true);
    });
    
    it("should identify HA covers (garage doors) as physical actuators", () => {
      expect(isPhysicalActuatorResource("ha://home/cover.garage_door")).toBe(true);
    });
    
    it("should identify ROS 2 resources as physical actuators", () => {
      expect(isPhysicalActuatorResource("ros2://robot01/cmd_vel")).toBe(true);
    });
    
    it("should identify MAVLink resources as physical actuators", () => {
      expect(isPhysicalActuatorResource("mavlink://1/cmd_vel")).toBe(true);
    });
    
    it("should not identify HA lights as physical actuators", () => {
      expect(isPhysicalActuatorResource("ha://home/light.living_room")).toBe(false);
    });
    
    it("should not identify HA sensors as physical actuators", () => {
      expect(isPhysicalActuatorResource("ha://home/sensor.temperature")).toBe(false);
    });
    
    it("should not identify MCP resources as physical actuators", () => {
      expect(isPhysicalActuatorResource("mcp://server/tool/fetch")).toBe(false);
    });
  });
  
  describe("escalateTier", () => {
    it("should not escalate when delta = 0", () => {
      expect(escalateTier(ApprovalTier.T0_OBSERVE, 0)).toBe(ApprovalTier.T0_OBSERVE);
      expect(escalateTier(ApprovalTier.T1_PREPARE, 0)).toBe(ApprovalTier.T1_PREPARE);
      expect(escalateTier(ApprovalTier.T2_ACT, 0)).toBe(ApprovalTier.T2_ACT);
    });
    
    it("should escalate by one tier when delta = 1.0", () => {
      expect(escalateTier(ApprovalTier.T0_OBSERVE, 1.0)).toBe(ApprovalTier.T1_PREPARE);
      expect(escalateTier(ApprovalTier.T1_PREPARE, 1.0)).toBe(ApprovalTier.T2_ACT);
      expect(escalateTier(ApprovalTier.T2_ACT, 1.0)).toBe(ApprovalTier.T3_COMMIT);
    });
    
    it("should cap escalation at T3_COMMIT", () => {
      expect(escalateTier(ApprovalTier.T3_COMMIT, 1.0)).toBe(ApprovalTier.T3_COMMIT);
      expect(escalateTier(ApprovalTier.T2_ACT, 2.0)).toBe(ApprovalTier.T3_COMMIT);
    });
  });
});
