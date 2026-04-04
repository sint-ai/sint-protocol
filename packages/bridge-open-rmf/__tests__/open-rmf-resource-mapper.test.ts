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
});

describe("open-rmf action/tier mapping", () => {
  it("maps status operations to observe/T0", () => {
    expect(rmfOperationToAction("fleet.status")).toBe("observe");
    expect(defaultTierForRmfOperation("fleet.status")).toBe(ApprovalTier.T0_OBSERVE);
  });

  it("maps dispatch operations to call/T2", () => {
    expect(rmfOperationToAction("task.dispatch")).toBe("call");
    expect(defaultTierForRmfOperation("task.dispatch")).toBe(ApprovalTier.T2_ACT);
  });

  it("maps emergency stop to override/T3", () => {
    expect(rmfOperationToAction("emergency.stop")).toBe("override");
    expect(defaultTierForRmfOperation("emergency.stop")).toBe(ApprovalTier.T3_COMMIT);
  });
});
