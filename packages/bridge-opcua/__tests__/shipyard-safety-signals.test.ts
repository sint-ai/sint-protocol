import { describe, expect, it } from "vitest";
import { ApprovalTier } from "@pshkv/core";
import {
  buildShipyardSafetySignalSet,
  buildShipyardSafetySnapshot,
  shipyardSafetySignalToOpcUaRef,
} from "../src/index.js";

describe("shipyard safety OPC UA signals", () => {
  it("maps hot-work permit to the canonical fixture resource", () => {
    const signal = shipyardSafetySignalToOpcUaRef("hotWorkPermit", {
      endpoint: "opc.tcp://safety-plc.shipyard.local",
    });

    expect(signal.nodeId).toBe("ns=2;s=HotWork/Permit");
    expect(signal.resource).toBe(
      "opcua://safety-plc.shipyard.local/ns%3D2%3Bs%3DHotWork%2FPermit",
    );
    expect(signal.action).toBe("subscribe");
    expect(signal.defaultTier).toBe(ApprovalTier.T0_OBSERVE);
    expect(signal.requiredFor).toContain("arc_weld_start");
  });

  it("builds the required shipyard safety signal set", () => {
    const signals = buildShipyardSafetySignalSet();

    expect(signals.map((signal) => signal.signal)).toEqual([
      "hotWorkPermit",
      "fireWatchReady",
      "fumeExtractionOnline",
      "gasAtmosphereSafe",
      "weldCellInterlockClosed",
      "estopClear",
    ]);
    expect(signals.every((signal) => signal.expectedFreshnessMs <= 2500)).toBe(true);
  });

  it("attaches observed values for evidence snapshots", () => {
    const snapshot = buildShipyardSafetySnapshot({
      observedAt: "2026-05-30T12:00:00.000Z",
      values: {
        hotWorkPermit: true,
        fireWatchReady: true,
        fumeExtractionOnline: false,
        gasAtmosphereSafe: true,
      },
    });

    expect(snapshot).toHaveLength(6);
    expect(snapshot.find((signal) => signal.signal === "fumeExtractionOnline"))
      .toEqual(expect.objectContaining({
        observedAt: "2026-05-30T12:00:00.000Z",
        value: false,
      }));
    expect(snapshot.find((signal) => signal.signal === "estopClear")?.value).toBeNull();
  });
});
