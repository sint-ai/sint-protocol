import { describe, expect, it } from "vitest";
import { ApprovalTier } from "@sint/core";
import {
  defaultTierForRmfOperation,
  rmfDispatchResourceUri,
  rmfFacilityResourceUri,
  rmfFleetResourceUri,
  rmfOperationToAction,
  rmfRobotResourceUri,
} from "../src/index.js";

describe("open-rmf resource URI mapping", () => {
  it("maps fleet and robot URIs", () => {
    expect(rmfFleetResourceUri("warehouse-fleet")).toBe("open-rmf://fleet/warehouse-fleet");
    expect(rmfRobotResourceUri("warehouse-fleet", "amr-07")).toBe(
      "open-rmf://fleet/warehouse-fleet/robot/amr-07",
    );
  });

  it("maps dispatch and facility URIs", () => {
    expect(rmfDispatchResourceUri("warehouse-fleet")).toBe(
      "open-rmf://fleet/warehouse-fleet/dispatch",
    );
    expect(rmfFacilityResourceUri("wh-1", "door", "dock-A")).toBe(
      "open-rmf://site/wh-1/door/dock-A",
    );
  });

  it("robot URI is nested under fleet URI", () => {
    const fleetUri = rmfFleetResourceUri("fleet-1");
    const robotUri = rmfRobotResourceUri("fleet-1", "bot-01");
    expect(robotUri.startsWith(fleetUri)).toBe(true);
    expect(robotUri).toContain("/robot/bot-01");
  });

  it("dispatch URI is nested under fleet URI", () => {
    const fleetUri = rmfFleetResourceUri("fleet-1");
    const dispatchUri = rmfDispatchResourceUri("fleet-1");
    expect(dispatchUri.startsWith(fleetUri)).toBe(true);
    expect(dispatchUri.endsWith("/dispatch")).toBe(true);
  });

  it("facility URI for lift kind", () => {
    expect(rmfFacilityResourceUri("site-A", "lift", "lift-01")).toBe(
      "open-rmf://site/site-A/lift/lift-01",
    );
  });

  it("facility URI for zone kind", () => {
    expect(rmfFacilityResourceUri("site-B", "zone", "charging-zone")).toBe(
      "open-rmf://site/site-B/zone/charging-zone",
    );
  });

  it("percent-encodes fleet names with special characters", () => {
    const uri = rmfFleetResourceUri("fleet 2025/v2");
    expect(uri).toBe("open-rmf://fleet/fleet%202025%2Fv2");
  });

  it("percent-encodes robot names with spaces", () => {
    const uri = rmfRobotResourceUri("fleet-1", "AMR Unit 7");
    expect(uri).toContain("AMR%20Unit%207");
  });
});

describe("open-rmf action/tier mapping", () => {
  it("maps status operations to observe/T0", () => {
    expect(rmfOperationToAction("fleet.status")).toBe("observe");
    expect(defaultTierForRmfOperation("fleet.status")).toBe(ApprovalTier.T0_OBSERVE);
  });

  it("maps robot.status to observe/T0", () => {
    expect(rmfOperationToAction("robot.status")).toBe("observe");
    expect(defaultTierForRmfOperation("robot.status")).toBe(ApprovalTier.T0_OBSERVE);
  });

  it("maps traffic.reserve to prepare/T1", () => {
    expect(rmfOperationToAction("traffic.reserve")).toBe("prepare");
    expect(defaultTierForRmfOperation("traffic.reserve")).toBe(ApprovalTier.T1_PREPARE);
  });

  it("maps dispatch operations to call/T2", () => {
    expect(rmfOperationToAction("task.dispatch")).toBe("call");
    expect(defaultTierForRmfOperation("task.dispatch")).toBe(ApprovalTier.T2_ACT);
  });

  it("maps task.cancel to call/T2", () => {
    expect(rmfOperationToAction("task.cancel")).toBe("call");
    expect(defaultTierForRmfOperation("task.cancel")).toBe(ApprovalTier.T2_ACT);
  });

  it("maps door.command to call/T2", () => {
    expect(rmfOperationToAction("door.command")).toBe("call");
    expect(defaultTierForRmfOperation("door.command")).toBe(ApprovalTier.T2_ACT);
  });

  it("maps lift.command to call/T2", () => {
    expect(rmfOperationToAction("lift.command")).toBe("call");
    expect(defaultTierForRmfOperation("lift.command")).toBe(ApprovalTier.T2_ACT);
  });

  it("maps emergency stop to override/T3", () => {
    expect(rmfOperationToAction("emergency.stop")).toBe("override");
    expect(defaultTierForRmfOperation("emergency.stop")).toBe(ApprovalTier.T3_COMMIT);
  });

  it("maps emergency.release to override/T3", () => {
    expect(rmfOperationToAction("emergency.release")).toBe("override");
    expect(defaultTierForRmfOperation("emergency.release")).toBe(ApprovalTier.T3_COMMIT);
  });
});
