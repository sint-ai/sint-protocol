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

  it("uses hostname only when endpoint has no port", () => {
    expect(opcUaNodeToResourceUri("ns=1;s=Temp", "opc.tcp://plc.factory.com")).toBe(
      "opcua://plc.factory.com/ns%3D1%3Bs%3DTemp",
    );
  });

  it("percent-encodes spaces in node ids", () => {
    const uri = opcUaNodeToResourceUri("ns=2;s=Motor Speed", "opc.tcp://plc.local:4840");
    expect(uri).toBe("opcua://plc.local:4840/ns%3D2%3Bs%3DMotor%20Speed");
  });

  it("trims whitespace from node id before encoding", () => {
    const uri = opcUaNodeToResourceUri("  ns=1;i=42  ");
    expect(uri).toBe("opcua://local/ns%3D1%3Bi%3D42");
  });

  it("sanitizes non-URL endpoint into underscore form", () => {
    const uri = opcUaNodeToResourceUri("ns=1;i=1", "plc@factory!local");
    expect(uri).toMatch(/^opcua:\/\/plc_factory_local\//);
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

  it("falls back to local when no endpoint provided", () => {
    const uri = opcUaMethodToResourceUri("ns=1;s=Obj", "ns=1;s=Methods/Stop");
    expect(uri.startsWith("opcua://local/")).toBe(true);
    expect(uri).toContain("/method/");
  });

  it("correctly segments object and method node ids", () => {
    const uri = opcUaMethodToResourceUri(
      "ns=3;s=Press",
      "ns=3;s=Start",
      "opc.tcp://press.local:4840",
    );
    const parts = uri.split("/method/");
    expect(parts).toHaveLength(2);
    expect(parts[0]).toContain("Press");
    expect(parts[1]).toContain("Start");
  });
});

describe("opcUa operation/tier mapping", () => {
  it("maps subscribe to observe", () => {
    expect(opcUaOperationToAction("subscribe")).toBe("observe");
    expect(defaultTierForOpcUaOperation("subscribe")).toBe(ApprovalTier.T0_OBSERVE);
  });

  it("maps browse to observe/T0", () => {
    expect(opcUaOperationToAction("browse")).toBe("observe");
    expect(defaultTierForOpcUaOperation("browse")).toBe(ApprovalTier.T0_OBSERVE);
  });

  it("maps read to read/T0", () => {
    expect(opcUaOperationToAction("read")).toBe("read");
    expect(defaultTierForOpcUaOperation("read")).toBe(ApprovalTier.T0_OBSERVE);
  });

  it("maps write to T2 by default", () => {
    expect(opcUaOperationToAction("write")).toBe("write");
    expect(defaultTierForOpcUaOperation("write", "ns=2;s=Line1/SpeedSetpoint")).toBe(
      ApprovalTier.T2_ACT,
    );
  });

  it("maps call to T2 by default for non-critical node", () => {
    expect(opcUaOperationToAction("call")).toBe("call");
    expect(defaultTierForOpcUaOperation("call", "ns=2;s=Conveyor/SetSpeed")).toBe(
      ApprovalTier.T2_ACT,
    );
  });

  it("promotes safety-critical write/call nodes to T3", () => {
    expect(isSafetyCriticalNode("ns=2;s=Safety/EStop")).toBe(true);
    expect(defaultTierForOpcUaOperation("call", "ns=2;s=Safety/EStop")).toBe(
      ApprovalTier.T3_COMMIT,
    );
  });

  it("isSafetyCriticalNode detects 'emergency' keyword", () => {
    expect(isSafetyCriticalNode("ns=1;s=Emergency/Shutdown")).toBe(true);
  });

  it("isSafetyCriticalNode detects 'interlock' keyword", () => {
    expect(isSafetyCriticalNode("ns=1;s=Line/Interlock")).toBe(true);
  });

  it("isSafetyCriticalNode returns false for non-critical node", () => {
    expect(isSafetyCriticalNode("ns=2;s=Conveyor/BeltSpeed")).toBe(false);
  });

  it("write on safety-critical node → T3", () => {
    expect(defaultTierForOpcUaOperation("write", "ns=2;s=Safety/Mode")).toBe(
      ApprovalTier.T3_COMMIT,
    );
  });
});
