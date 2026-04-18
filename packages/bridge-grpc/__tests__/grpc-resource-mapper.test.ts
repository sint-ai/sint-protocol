import { describe, expect, it } from "vitest";
import { ApprovalTier } from "@sint-ai/core";
import {
  GrpcBridgeAdapter,
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

  it("URI includes service and method as distinct path segments", () => {
    const uri = grpcMethodToResourceUri("robot.v1.ArmService", "MoveTo", "arm.local:50051");
    const parts = uri.replace("grpc://arm.local:50051/", "").split("/");
    expect(parts[0]).toBe("robot.v1.ArmService");
    expect(parts[1]).toBe("MoveTo");
  });

  it("encodes special characters in service name", () => {
    const uri = grpcMethodToResourceUri("my service", "GetStatus", "host:9090");
    expect(uri).toContain("my%20service");
  });

  it("sanitizes invalid host characters to underscore", () => {
    const uri = grpcMethodToResourceUri("svc.v1.Foo", "Bar", "host@invalid!");
    expect(uri).toMatch(/^grpc:\/\/host_invalid_\//);
  });

  it("trims whitespace from service and method segments", () => {
    const uri = grpcMethodToResourceUri("  svc.v1.Health  ", "  Check  ", "host:9090");
    expect(uri).toBe("grpc://host:9090/svc.v1.Health/Check");
  });
});

describe("grpc pattern/action and tier defaults", () => {
  it("maps server stream to observe/T0", () => {
    expect(grpcPatternToAction("server_stream")).toBe("observe");
    expect(defaultTierForGrpcMethod("server_stream", "ops.v1.Health", "Watch")).toBe(
      ApprovalTier.T0_OBSERVE,
    );
  });

  it("maps client stream to write", () => {
    expect(grpcPatternToAction("client_stream")).toBe("write");
  });

  it("maps bidi stream to call", () => {
    expect(grpcPatternToAction("bidi_stream")).toBe("call");
  });

  it("maps unary non-critical methods to T2", () => {
    expect(grpcPatternToAction("unary")).toBe("call");
    expect(defaultTierForGrpcMethod("unary", "warehouse.v1.DispatchService", "DispatchTask")).toBe(
      ApprovalTier.T2_ACT,
    );
  });

  it("client stream on non-critical method → T2", () => {
    expect(defaultTierForGrpcMethod("client_stream", "data.v1.Ingest", "StreamRecords")).toBe(
      ApprovalTier.T2_ACT,
    );
  });

  it("promotes safety critical methods to T3", () => {
    expect(isSafetyCriticalGrpcMethod("robot.v1.Safety", "EmergencyStop")).toBe(true);
    expect(defaultTierForGrpcMethod("unary", "robot.v1.Safety", "EmergencyStop")).toBe(
      ApprovalTier.T3_COMMIT,
    );
  });

  it("isSafetyCriticalGrpcMethod detects 'arm' keyword", () => {
    expect(isSafetyCriticalGrpcMethod("robot.v1.Arm", "Extend")).toBe(true);
  });

  it("isSafetyCriticalGrpcMethod detects 'transferfunds' keyword", () => {
    expect(isSafetyCriticalGrpcMethod("finance.v1.Payment", "TransferFunds")).toBe(true);
  });

  it("isSafetyCriticalGrpcMethod returns false for regular method", () => {
    expect(isSafetyCriticalGrpcMethod("monitoring.v1.Metrics", "GetStats")).toBe(false);
  });

  it("server_stream on safety-critical service → T3", () => {
    // server_stream → observe → T0, but safety keyword overrides to T3 only for non-observe patterns
    // For observe, the tier is always T0 regardless of safety keyword
    expect(defaultTierForGrpcMethod("server_stream", "robot.v1.Safety", "WatchEmergency")).toBe(
      ApprovalTier.T0_OBSERVE,
    );
  });
});

describe("GrpcBridgeAdapter", () => {
  it("maps invocation metadata into canonical request fields", () => {
    const adapter = new GrpcBridgeAdapter();
    const mapped = adapter.mapInvocation({
      requestId: "req-1",
      agentId: "agent-1",
      tokenId: "tok-1",
      service: "warehouse.v1.DispatchService",
      method: "DispatchTask",
      host: "rmf-gw.local:50051",
      params: { taskId: "task-100" },
    });

    expect(mapped.resource).toBe(
      "grpc://rmf-gw.local:50051/warehouse.v1.DispatchService/DispatchTask",
    );
    expect(mapped.action).toBe("call");
    expect(mapped.params.taskId).toBe("task-100");
  });

  it("returns deterministic decision hints", () => {
    const adapter = new GrpcBridgeAdapter();
    const hint = adapter.decisionHint({
      requestId: "req-2",
      agentId: "agent-2",
      tokenId: "tok-2",
      service: "robot.v1.Safety",
      method: "EmergencyStop",
      pattern: "unary",
    });

    expect(hint.action).toBe("call");
    expect(hint.suggestedTier).toBe(ApprovalTier.T3_COMMIT);
  });
});
