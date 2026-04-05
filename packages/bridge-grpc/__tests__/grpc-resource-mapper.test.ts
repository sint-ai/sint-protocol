import { describe, expect, it } from "vitest";
import { ApprovalTier } from "@sint/core";
import {
  grpcMethodToResourceUri,
  grpcPatternToAction,
  isSafetyCriticalGrpcMethod,
  defaultTierForGrpcMethod,
} from "../src/index.js";

describe("grpcMethodToResourceUri", () => {
  it("builds canonical URI with explicit host", () => {
    expect(
      grpcMethodToResourceUri("warehouse.v1.DispatchService", "DispatchTask", "rmf-gw.local:50051"),
    ).toBe("grpc://rmf-gw.local:50051/warehouse.v1.DispatchService/DispatchTask");
  });

  it("falls back to local host when host missing", () => {
    expect(grpcMethodToResourceUri("ops.v1.Health", "Watch")).toBe("grpc://local/ops.v1.Health/Watch");
  });
});

describe("grpc pattern/action and tier defaults", () => {
  it("maps server stream to observe/T0", () => {
    expect(grpcPatternToAction("server_stream")).toBe("observe");
    expect(defaultTierForGrpcMethod("server_stream", "ops.v1.Health", "Watch")).toBe(
      ApprovalTier.T0_OBSERVE,
    );
  });

  it("maps unary non-critical methods to T2", () => {
    expect(grpcPatternToAction("unary")).toBe("call");
    expect(defaultTierForGrpcMethod("unary", "warehouse.v1.DispatchService", "DispatchTask")).toBe(
      ApprovalTier.T2_ACT,
    );
  });

  it("promotes safety critical methods to T3", () => {
    expect(isSafetyCriticalGrpcMethod("robot.v1.Safety", "EmergencyStop")).toBe(true);
    expect(defaultTierForGrpcMethod("unary", "robot.v1.Safety", "EmergencyStop")).toBe(
      ApprovalTier.T3_COMMIT,
    );
  });
});

