/** Executable ASI03/ASI09 fixtures and regressions for the real MCP enforcement paths. */
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApprovalTier, RiskTier, normalizeComboAction, type SintRequest, type SintCapabilityToken, type McpAnnotations } from "@pshkv/core";
import { generateKeypair, generateUUIDv7, issueCapabilityToken } from "@pshkv/gate-capability-tokens";
import { PolicyGateway, checkForbiddenCombos } from "@pshkv/gate-policy-gateway";
import { MCPInterceptor } from "@pshkv/bridge-mcp";

interface FixtureCase {
  name: string;
  attack: string;
  request?: { resource: string; action: string; params: Record<string, unknown>; mcpAnnotations?: McpAnnotations };
  token?: { resource: string; actions: string[] };
  eventSequence?: { resource: string; action: string; decision: string }[];
  expected: { decisionAction?: string; minTier?: ApprovalTier; forbiddenComboDetected?: boolean; escalationRequired?: boolean };
}
const fixture: { cases: FixtureCase[] } = JSON.parse(readFileSync(new URL("../fixtures/security/mcp-attack-surface.v1.json", import.meta.url), "utf8"));
const tierOrder = [ApprovalTier.T0_OBSERVE, ApprovalTier.T1_PREPARE, ApprovalTier.T2_ACT, ApprovalTier.T3_COMMIT];

function setup(scope = "mcp://*", actions = ["call", "exec.run"], trust?: "untrusted" | "provisional") {
  const key = generateKeypair();
  const issued = issueCapabilityToken({
    issuer: key.publicKey, subject: key.publicKey, resource: scope, actions, constraints: {},
    delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(), revocable: true,
  }, key.privateKey);
  if (!issued.ok) throw new Error(issued.error);
  const token = issued.value;
  const tokens = new Map<string, SintCapabilityToken>([[token.tokenId, token]]);
  const gateway = new PolicyGateway({ resolveToken: id => tokens.get(id), ...(trust ? { getAgentTrustLevel: () => trust } : {}) });
  function request(resource: string, action = "call", extra: Partial<SintRequest> = {}): SintRequest {
    return { requestId: generateUUIDv7(), timestamp: new Date().toISOString(), agentId: key.publicKey, tokenId: token.tokenId, resource, action, params: {}, ...extra };
  }
  return { gateway, request, token, key, tokens };
}

afterEach(() => vi.useRealTimers());

describe("MCP ASI03/ASI09 JSON fixtures", () => {
  for (const testCase of fixture.cases.filter(c => c.attack === "ASI03" || c.attack === "ASI09")) {
    it(testCase.name, async () => {
      const { gateway, request } = setup(testCase.token?.resource, testCase.token?.actions);
      if (testCase.request) {
        const input = testCase.request;
        const decision = await gateway.intercept(request(input.resource, input.action, input));
        expect(decision.action).toBe(testCase.expected.decisionAction);
        expect(tierOrder.indexOf(decision.assignedTier)).toBeGreaterThanOrEqual(tierOrder.indexOf(testCase.expected.minTier!));
      } else {
        expect(testCase.eventSequence?.length).toBeGreaterThan(1);
        let reason = "";
        for (const event of testCase.eventSequence!) {
          const decision = await gateway.intercept(request(event.resource, event.action));
          expect(decision.action).toBe(event.decision);
          reason = decision.escalation?.reason ?? "";
        }
        expect(testCase.expected.forbiddenComboDetected).toBe(true);
        expect(reason).toContain("Forbidden combination detected");
      }
    });
  }
});

describe("MCP enforcement boundaries", () => {
  it.each([undefined, "untrusted", "provisional"] as const)("exec.run always requires T3 with trust=%s", async trust => {
    const { gateway, request } = setup(undefined, undefined, trust);
    const decision = await gateway.intercept(request("mcp://custom/unknown", "exec.run"));
    expect(decision).toMatchObject({ action: "escalate", assignedTier: ApprovalTier.T3_COMMIT, assignedRisk: "T3_irreversible" });
  });
  it.each(["mcp://terminal/run_command", "mcp://conway/sandbox_exec", "mcp://filesystem/deleteFile"])("annotations cannot lower %s", async resource => {
    const { gateway, request } = setup();
    const decision = await gateway.intercept(request(resource, "call", { mcpAnnotations: { readOnlyHint: true, openWorldHint: true } }));
    expect(decision.action).toBe("escalate");
    expect(tierOrder.indexOf(decision.assignedTier)).toBeGreaterThanOrEqual(2);
  });
  it.each(["push_files", "publish_page", "refresh_token", "retrieval_search"])("benign keyword substring %s stays T1", async name => {
    const { gateway, request } = setup();
    expect(await gateway.intercept(request(`mcp://custom/${name}`))).toMatchObject({ action: "allow", assignedTier: ApprovalTier.T1_PREPARE });
  });
  it("preserves read and canonical exec controls", async () => {
    const { gateway, request } = setup();
    expect(await gateway.intercept(request("mcp://filesystem/readFile"))).toMatchObject({ action: "allow", assignedTier: ApprovalTier.T0_OBSERVE });
    expect(await gateway.intercept(request("mcp://exec/run", "exec.run"))).toMatchObject({ action: "escalate", assignedTier: ApprovalTier.T3_COMMIT });
  });
  it("honors token scope and action restrictions before escalation", async () => {
    const { gateway, request } = setup("mcp://filesystem/*", ["call"]);
    expect((await gateway.intercept(request("mcp://terminal/run_command"))).action).toBe("deny");
    expect((await gateway.intercept(request("mcp://filesystem/writeFile", "exec.run"))).action).toBe("deny");
  });
  it("carries destructive hints through the interceptor without changing call permission", async () => {
    const { gateway, key, token } = setup("mcp://files/*", ["call"]);
    const interceptor = new MCPInterceptor({ gateway });
    const session = interceptor.createSession({ agentId: key.publicKey, tokenId: token.tokenId, serverName: "files" });
    const result = await interceptor.interceptToolCall(session, {
      callId: "purge", serverName: "files", toolName: "purge", arguments: {}, timestamp: new Date().toISOString(), annotations: { destructiveHint: true },
    });
    expect(result).toMatchObject({ action: "escalate", decision: { assignedTier: ApprovalTier.T3_COMMIT } });
  });
  it("detects combos across independent MCP sessions without client history", async () => {
    const { gateway, key, token } = setup();
    const interceptor = new MCPInterceptor({ gateway });
    for (const [serverName, toolName] of [["filesystem", "writeFile"], ["conway", "sandbox_exec"]]) {
      const session = interceptor.createSession({ agentId: key.publicKey, tokenId: token.tokenId, serverName: serverName! });
      const result = await interceptor.interceptToolCall(session, { callId: toolName!, serverName: serverName!, toolName: toolName!, arguments: {}, timestamp: new Date().toISOString() });
      if (serverName === "conway") expect(result.decision.escalation?.reason).toContain("Forbidden combination detected");
      else expect(result.action).toBe("forward");
    }
  });
  it("expires gateway history using server time, ignoring client timestamps", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { gateway, request } = setup();
    await gateway.intercept(request("mcp://filesystem/writeFile", "call", { timestamp: new Date(Date.now() + 86_400_000).toISOString() }));
    vi.setSystemTime(Date.now() + 60_001);
    const decision = await gateway.intercept(request("mcp://conway/sandbox_exec", "exec.run"));
    expect(decision.action).toBe("escalate");
    expect(decision.escalation?.reason).not.toContain("Forbidden combination");
  });
  it("keeps different agents isolated on the same gateway", async () => {
    const first = setup();
    const second = setup();
    first.tokens.set(second.token.tokenId, second.token);
    await first.gateway.intercept(first.request("mcp://filesystem/writeFile"));
    const decision = await first.gateway.intercept(second.request("mcp://conway/sandbox_exec", "exec.run"));
    expect(decision.escalation?.reason).not.toContain("Forbidden combination");
  });
  it("includes escalated credential reads that may execute after approval", async () => {
    const { gateway, request } = setup();
    expect((await gateway.intercept(request("mcp://credential/read"))).action).toBe("escalate");
    const decision = await gateway.intercept(request("mcp://network/connect"));
    expect(decision).toMatchObject({ action: "escalate", assignedTier: ApprovalTier.T3_COMMIT });
    expect(decision.escalation?.reason).toContain("Credential theft");
  });
  it("allows custom tier rules to raise risk but not lower MCP semantics", async () => {
    const { token, request } = setup();
    const gateway = new PolicyGateway({
      resolveToken: () => token,
      tierRules: [{ resourcePattern: "mcp://*", actions: ["call"], baseTier: ApprovalTier.T0_OBSERVE, baseRisk: RiskTier.T0_READ }],
    });
    expect(await gateway.intercept(request("mcp://terminal/run_command"))).toMatchObject({ action: "escalate", assignedTier: ApprovalTier.T3_COMMIT });
    expect(await gateway.intercept(request("mcp://credential/readSecret"))).toMatchObject({ action: "escalate", assignedTier: ApprovalTier.T3_COMMIT });
  });
  it("fails closed for malformed and encoded execution identities", async () => {
    const { gateway, request } = setup();
    for (const resource of ["mcp://terminal/run%5Fcommand", "mcp://terminal/run%ZZcommand", "mcp://broken"]) {
      expect(await gateway.intercept(request(resource))).toMatchObject({ action: "escalate", assignedTier: ApprovalTier.T3_COMMIT });
    }
  });
  it("fails closed instead of evicting live combo history at capacity", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { gateway, request } = setup();
    for (let i = 0; i < 1024; i++) expect((await gateway.intercept(request("mcp://filesystem/writeFile"))).action).toBe("allow");
    expect(await gateway.intercept(request("mcp://terminal/run_command"))).toMatchObject({ action: "deny", denial: { policyViolated: "COMBO_HISTORY_CAPACITY" } });
    vi.setSystemTime(Date.now() + 120_001);
    expect((await gateway.intercept(request("mcp://filesystem/writeFile"))).action).toBe("allow");
  });
  it("checks history after asynchronous envelope evaluation without losing concurrent actions", async () => {
    const { token, request } = setup();
    let releaseWrite!: () => void;
    let waiting = false;
    const holdWrite = new Promise<void>(resolve => { releaseWrite = resolve; });
    const gateway = new PolicyGateway({
      resolveToken: () => token,
      dynamicEnvelope: { computeEnvelope: async input => {
        if (input.resource === "mcp://filesystem/writeFile") { waiting = true; await holdWrite; }
        return {};
      } },
    });
    const pendingWrite = gateway.intercept(request("mcp://filesystem/writeFile"));
    await vi.waitFor(() => expect(waiting).toBe(true));
    expect((await gateway.intercept(request("mcp://network/connect"))).action).toBe("allow");
    releaseWrite();
    const decision = await pendingWrite;
    expect(decision.action).toBe("escalate");
    expect(decision.escalation?.reason).toContain("download-then-save");
  });
  it("does not record denied writes", async () => {
    const { gateway, request } = setup("mcp://conway/*");
    expect((await gateway.intercept(request("mcp://filesystem/writeFile"))).action).toBe("deny");
    expect((await gateway.intercept(request("mcp://conway/sandbox_exec", "exec.run"))).escalation?.reason).not.toContain("Forbidden combination");
  });
});

describe("timestamped combo matching", () => {
  it("honors each sequence window and excludes future events", () => {
    for (const timestampMs of [0, 60_002]) {
      expect(checkForbiddenCombos([{ action: "filesystem.writeFile", timestampMs }], "exec.run", undefined, 60_001).triggered).toBe(false);
    }
    expect(checkForbiddenCombos([{ action: "filesystem.writeFile", timestampMs: 1 }], "exec.run", undefined, 60_001).triggered).toBe(true);
  });
  it("requires the current action to finish the sequence", () => {
    expect(checkForbiddenCombos(["filesystem.write", "exec.run"], "read").triggered).toBe(false);
  });
  it("preserves ROS2 and engine vocabularies while recognizing explicit MCP identities", () => {
    expect(normalizeComboAction("call", "mcp://engine/execute")).toBe("exec.run");
    expect(checkForbiddenCombos(["ros2.cmd_vel.publish"], "ros2.mode_change.call").triggered).toBe(true);
    expect(checkForbiddenCombos(["ros2.estop.override"], "ros2.cmd_vel.publish").triggered).toBe(true);
    expect(checkForbiddenCombos(["engine.system1.anomaly"], "engine.system2.plan.step.executed").triggered).toBe(true);
  });
  it("normalizes custom combination patterns as well as observed actions", () => {
    expect(checkForbiddenCombos(["filesystem.writeFile"], "shell.execute", [{
      sequence: ["filesystem.writeFile", "shell.execute"], windowMs: 1000,
      requiredTier: ApprovalTier.T3_COMMIT, reason: "custom MCP vocabulary",
    }]).triggered).toBe(true);
  });
  it("normalizes MCP tool ids without broad prefix collisions", () => {
    expect(checkForbiddenCombos(["filesystem.writeFile"], normalizeComboAction("call", "mcp://shell/execute")).triggered).toBe(true);
    expect(checkForbiddenCombos(["filesystem.writeFileBackup"], "exec.run").triggered).toBe(false);
  });
});
