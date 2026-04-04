import { describe, expect, it } from "vitest";
import { ApprovalTier } from "@sint/core";
import {
  defaultTierForOpcUaOperation,
  isSafetyCriticalNode,
  opcUaMethodToResourceUri,
  opcUaNodeToResourceUri,
  opcUaOperationToAction,
} from "../src/index.js";

describe("opcUaNodeToResourceUri", () => {
  it("maps node id with endpoint", () => {
    expect(
      opcUaNodeToResourceUri("ns=2;s=Cell/Conveyor/Speed", "opc.tcp://plc-a.local:4840"),
    ).toBe("opcua://plc-a.local:4840/ns%3D2%3Bs%3DCell%2FConveyor%2FSpeed");
  });

  it("maps node id without endpoint", () => {
    expect(opcUaNodeToResourceUri("ns=2;i=10853")).toBe("opcua://local/ns%3D2%3Bi%3D10853");
  });
});

describe("opcUaMethodToResourceUri", () => {
  it("maps method call target", () => {
    expect(
      opcUaMethodToResourceUri(
        "ns=2;s=RobotArm",
        "ns=2;s=Methods/StartCycle",
        "opc.tcp://plc-b.local:4840",
      ),
    ).toBe(
      "opcua://plc-b.local:4840/ns%3D2%3Bs%3DRobotArm/method/ns%3D2%3Bs%3DMethods%2FStartCycle",
    );
  });
});

describe("opcUa operation/tier mapping", () => {
  it("maps subscribe to observe", () => {
    expect(opcUaOperationToAction("subscribe")).toBe("observe");
    expect(defaultTierForOpcUaOperation("subscribe")).toBe(ApprovalTier.T0_OBSERVE);
  });

  it("maps write to T2 by default", () => {
    expect(opcUaOperationToAction("write")).toBe("write");
    expect(defaultTierForOpcUaOperation("write", "ns=2;s=Line1/SpeedSetpoint")).toBe(
      ApprovalTier.T2_ACT,
    );
  });

  it("promotes safety-critical write/call nodes to T3", () => {
    expect(isSafetyCriticalNode("ns=2;s=Safety/EStop")).toBe(true);
    expect(defaultTierForOpcUaOperation("call", "ns=2;s=Safety/EStop")).toBe(
      ApprovalTier.T3_COMMIT,
    );
  });
});
