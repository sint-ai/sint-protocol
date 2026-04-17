import { describe, expect, it } from "vitest";
import type { PolicyDecision, SintRequest } from "@pshkv/core";
import { ApprovalTier, RiskTier } from "@pshkv/core";
import { SINTPDPInterceptor } from "../src/interceptor.js";

const timestamp = "2026-04-16T20:00:00.000Z";
const requestId = "01963d6b-4100-7000-8000-000000000001";
const tokenId = "01963d6b-4200-7000-8000-000000000001";

function allowDecision(): PolicyDecision {
  return {
    requestId,
    timestamp,
    action: "allow",
    assignedTier: ApprovalTier.T1_PREPARE,
    assignedRisk: RiskTier.T1_WRITE_LOW,
  };
}

describe("SINTPDPInterceptor", () => {
  it("maps a SEP-1763 style request into a SINT gateway request", async () => {
    let captured: SintRequest | undefined;

    const interceptor = new SINTPDPInterceptor({
      gateway: {
        async intercept(request) {
          captured = request;
          return allowDecision();
        },
      },
      defaultTokenId: tokenId,
      now: () => timestamp,
      createRequestId: () => requestId,
    });

    const result = await interceptor.evaluate({
      caller_identity: "did:key:z6MkAgent",
      mcp_call: {
        serverName: "filesystem",
        toolName: "readFile",
        params: { path: "/tmp/demo.txt" },
      },
      context: {
        recentActions: ["filesystem.listDirectory"],
        physicalContext: { humanDetected: false },
      },
    });

    expect(result.verdict).toBe("allow");
    expect(result.tier).toBe(ApprovalTier.T1_PREPARE);
    expect(captured).toEqual({
      requestId,
      timestamp,
      agentId: "did:key:z6MkAgent",
      tokenId,
      resource: "mcp://filesystem/readFile",
      action: "call",
      params: { path: "/tmp/demo.txt" },
      physicalContext: { humanDetected: false },
      recentActions: ["filesystem.listDirectory"],
      executionContext: undefined,
    });
  });

  it("respects explicit resource, action, and context tokenId", async () => {
    let captured: SintRequest | undefined;

    const interceptor = new SINTPDPInterceptor({
      gateway: {
        async intercept(request) {
          captured = request;
          return allowDecision();
        },
      },
      defaultTokenId: "01963d6b-4300-7000-8000-000000000001",
      now: () => timestamp,
      createRequestId: () => requestId,
    });

    await interceptor.evaluate({
      caller_identity: "did:key:z6MkAgent",
      mcp_call: {
        resource: "ros2:///cmd_vel",
        action: "publish",
        params: { linear: { x: 0.2 } },
      },
      context: {
        tokenId,
        executionContext: {
          bridgeId: "bridge-1",
          bridgeProtocol: "mcp",
        },
      },
    });

    expect(captured?.tokenId).toBe(tokenId);
    expect(captured?.resource).toBe("ros2:///cmd_vel");
    expect(captured?.action).toBe("publish");
    expect(captured?.executionContext).toEqual({
      bridgeId: "bridge-1",
      bridgeProtocol: "mcp",
    });
  });

  it("fails closed when the gateway throws", async () => {
    const interceptor = new SINTPDPInterceptor({
      gateway: {
        async intercept() {
          throw new Error("network partition");
        },
      },
      defaultTokenId: tokenId,
      now: () => timestamp,
      createRequestId: () => requestId,
    });

    const result = await interceptor.evaluate({
      caller_identity: "did:key:z6MkAgent",
      mcp_call: {
        serverName: "filesystem",
        toolName: "deleteFile",
      },
    });

    expect(result.verdict).toBe("deny");
    expect(result.decision.action).toBe("deny");
    expect(result.decision.denial?.policyViolated).toBe("GATEWAY_UNAVAILABLE");
  });

  it("requires a token id from config or request context", async () => {
    const interceptor = new SINTPDPInterceptor({
      gateway: {
        async intercept() {
          return allowDecision();
        },
      },
      now: () => timestamp,
      createRequestId: () => requestId,
    });

    await expect(
      interceptor.evaluate({
        caller_identity: "did:key:z6MkAgent",
        mcp_call: { serverName: "filesystem", toolName: "readFile" },
      }),
    ).rejects.toThrow(/tokenId/);
  });

  it("does not execute downstream work when the decision escalates", async () => {
    let executed = false;

    const interceptor = new SINTPDPInterceptor({
      gateway: {
        async intercept() {
          return {
            requestId,
            timestamp,
            action: "escalate",
            assignedTier: ApprovalTier.T3_COMMIT,
            assignedRisk: RiskTier.T3_IRREVERSIBLE,
            escalation: {
              requiredTier: ApprovalTier.T3_COMMIT,
              reason: "Human approval required",
              timeoutMs: 120000,
              fallbackAction: "deny",
            },
          };
        },
      },
      defaultTokenId: tokenId,
      now: () => timestamp,
      createRequestId: () => requestId,
    });

    const result = await interceptor.runGuarded(
      {
        caller_identity: "did:key:z6MkAgent",
        mcp_call: { serverName: "filesystem", toolName: "deleteFile" },
      },
      {
        execute: async () => {
          executed = true;
          return "ok";
        },
      },
    );

    expect(result.stage).toBe("escalated");
    expect(executed).toBe(false);
  });

  it("blocks execution when the gate prerequisite is missing", async () => {
    let executed = false;

    const interceptor = new SINTPDPInterceptor({
      gateway: {
        async intercept() {
          return allowDecision();
        },
      },
      defaultTokenId: tokenId,
      now: () => timestamp,
      createRequestId: () => requestId,
    });

    const result = await interceptor.runGuarded(
      {
        caller_identity: "did:key:z6MkAgent",
        mcp_call: { serverName: "filesystem", toolName: "writeFile" },
      },
      {
        verifyGatePrerequisite: async () => ({
          ok: false,
          reason: "Missing verified gate receipt",
        }),
        execute: async () => {
          executed = true;
          return "ok";
        },
      },
    );

    expect(result.stage).toBe("blocked");
    expect(result.decision.verdict).toBe("deny");
    expect(result.decision.decision.denial?.policyViolated).toBe("GATE_PREREQUISITE_MISSING");
    expect(executed).toBe(false);
  });

  it("returns failed when downstream execution throws", async () => {
    const seenErrors: unknown[] = [];

    const interceptor = new SINTPDPInterceptor({
      gateway: {
        async intercept() {
          return allowDecision();
        },
      },
      defaultTokenId: tokenId,
      now: () => timestamp,
      createRequestId: () => requestId,
    });

    const result = await interceptor.runGuarded(
      {
        caller_identity: "did:key:z6MkAgent",
        mcp_call: { serverName: "filesystem", toolName: "writeFile" },
      },
      {
        verifyGatePrerequisite: async () => ({
          ok: true,
          evidenceRef: "sint://ledger/gate-001",
        }),
        execute: async () => {
          throw new Error("downstream actuator timeout");
        },
        onExecutionError: async (error) => {
          seenErrors.push(error);
        },
      },
    );

    expect(result.stage).toBe("failed");
    expect(result.decision.verdict).toBe("allow");
    expect((result.error as Error).message).toContain("downstream actuator timeout");
    expect(seenErrors).toHaveLength(1);
  });
});
