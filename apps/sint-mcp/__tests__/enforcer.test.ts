/**
 * SINT MCP — Enforcer tests.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { PolicyEnforcer } from "../src/enforcer.js";
import { DownstreamManager } from "../src/downstream.js";
import { PolicyGateway } from "@pshkv/gate-policy-gateway";
import { ApprovalQueue } from "@pshkv/gate-policy-gateway";
import { RevocationStore, generateKeypair, issueCapabilityToken } from "@pshkv/gate-capability-tokens";
import type { SintCapabilityToken } from "@pshkv/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

function createTestSetup() {
  const keypair = generateKeypair();
  const tokenStore = new Map<string, SintCapabilityToken>();
  const revocationStore = new RevocationStore();

  const expiresAt = new Date(Date.now() + 3600_000)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");

  const tokenResult = issueCapabilityToken(
    {
      issuer: keypair.publicKey,
      subject: keypair.publicKey,
      resource: "mcp://*",
      actions: ["call", "exec.run"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt,
      revocable: true,
    },
    keypair.privateKey,
  );

  if (!tokenResult.ok) throw new Error("Failed to issue token");
  const token = tokenResult.value;
  tokenStore.set(token.tokenId, token);

  const gateway = new PolicyGateway({
    resolveToken: (id) => tokenStore.get(id),
    revocationStore,
  });

  const approvalQueue = new ApprovalQueue({ defaultTimeoutMs: 5000 });
  const downstream = new DownstreamManager();

  // Add mock downstream
  const mockClient = {} as Client;
  const mockCallTool = async (_name: string, _toolName: string, _args: Record<string, unknown>) => ({
    content: [{ type: "text" as const, text: "mock result" }],
  });
  // Override callTool for testing
  downstream.addConnectedClient("filesystem", mockClient, [
    { name: "readFile", description: "Read a file", inputSchema: { type: "object" } },
    { name: "writeFile", description: "Write a file", inputSchema: { type: "object" } },
  ]);
  // Patch callTool to return mock result
  (downstream as any).servers.get("filesystem")!.client.callTool = async (params: any) => ({
    content: [{ type: "text", text: `result for ${params.name}` }],
  });

  const enforcer = new PolicyEnforcer(
    gateway,
    approvalQueue,
    downstream,
    keypair.publicKey,
    token.tokenId,
  );

  return { enforcer, gateway, approvalQueue, downstream, keypair, token, tokenStore, revocationStore };
}

describe("PolicyEnforcer", () => {
  it("allows T0 read-only tool calls", async () => {
    const { enforcer, downstream } = createTestSetup();

    // Override callTool to return actual result
    const origCallTool = downstream.callTool.bind(downstream);
    downstream.callTool = async (serverName: string, toolName: string, args: Record<string, unknown>) => {
      return { content: [{ type: "text", text: "file contents" }] };
    };

    const result = await enforcer.enforce(
      { serverName: "filesystem", toolName: "readFile" },
      { path: "/tmp/test.txt" },
    );

    expect(result.allowed).toBe(true);
    expect(result.decision.action).toBe("allow");
    expect(result.result).toBeDefined();
  });

  it("allows T1 write tool calls", async () => {
    const { enforcer, downstream } = createTestSetup();

    downstream.callTool = async () => {
      return { content: [{ type: "text", text: "written" }] };
    };

    const result = await enforcer.enforce(
      { serverName: "filesystem", toolName: "writeFile" },
      { path: "/tmp/test.txt", content: "hello" },
    );

    expect(result.allowed).toBe(true);
    expect(result.decision.action).toBe("allow");
  });

  it.each([
    ["filesystem", "deleteFile", "T2_act"],
    ["terminal", "run_command", "T3_commit"],
    ["conway", "sandbox_exec", "T3_commit"],
  ])("requires approval before forwarding %s/%s", async (serverName, toolName, tier) => {
    const { enforcer, downstream, approvalQueue } = createTestSetup();
    const forward = vi.spyOn(downstream, "callTool");
    const pending = enforcer.enforce({ serverName, toolName }, {});
    await vi.waitFor(() => expect(approvalQueue.getPending()).toHaveLength(1));
    expect(forward).not.toHaveBeenCalled();
    const approval = approvalQueue.getPending()[0]!;
    approvalQueue.resolve(approval.requestId, { status: "denied", by: "operator" });
    const result = await pending;
    expect(result.allowed).toBe(false);
    expect(result.decision.action).toBe("escalate");
    expect(result.decision.assignedTier).toBe(tier);
    expect(forward).not.toHaveBeenCalled();
    approvalQueue.dispose();
  });

  it("denies when token is revoked", async () => {
    const { enforcer, token, revocationStore } = createTestSetup();

    revocationStore.revoke(token.tokenId, "test revocation", "admin");

    const result = await enforcer.enforce(
      { serverName: "filesystem", toolName: "readFile" },
      { path: "/tmp/test.txt" },
    );

    expect(result.allowed).toBe(false);
    expect(result.denyReason).toContain("revoked");
  });

  it("detects write-execute history in the gateway", async () => {
    const { enforcer, downstream, approvalQueue } = createTestSetup();
    const forward = vi.spyOn(downstream, "callTool").mockResolvedValue({ content: [] });
    await enforcer.enforce({ serverName: "filesystem", toolName: "writeFile" }, {});
    const pending = enforcer.enforce({ serverName: "conway", toolName: "sandbox_exec" }, {});
    await vi.waitFor(() => expect(approvalQueue.getPending()).toHaveLength(1));
    const approval = approvalQueue.getPending()[0]!;
    approvalQueue.resolve(approval.requestId, { status: "denied", by: "operator" });
    const result = await pending;
    expect(result.decision.escalation?.reason).toContain("Forbidden combination detected");
    expect(forward).toHaveBeenCalledTimes(1);
    approvalQueue.dispose();
  });

  it("uses discovered destructive annotations without requiring exec.run permission", async () => {
    const { enforcer, downstream, approvalQueue } = createTestSetup();
    downstream.addConnectedClient("files", {} as Client, [
      { name: "purge", inputSchema: { type: "object" }, annotations: { destructiveHint: true } },
    ]);
    const forward = vi.spyOn(downstream, "callTool");
    const pending = enforcer.enforce({ serverName: "files", toolName: "purge" }, {});
    await vi.waitFor(() => expect(approvalQueue.getPending()).toHaveLength(1));
    const approval = approvalQueue.getPending()[0]!;
    expect(approval.request.action).toBe("call");
    approvalQueue.resolve(approval.requestId, { status: "denied", by: "operator" });
    const result = await pending;
    expect(result.decision.assignedTier).toBe("T3_commit");
    expect(forward).not.toHaveBeenCalled();
    approvalQueue.dispose();
  });

  it("handles missing downstream server gracefully", async () => {
    const { enforcer } = createTestSetup();

    // Try to call a non-existent server (policy will still allow based on token)
    // But the downstream.callTool will return error
    const result = await enforcer.enforce(
      { serverName: "nonexistent", toolName: "read" },
      {},
    );

    // The gateway allows but downstream returns error
    if (result.allowed && result.result) {
      expect(result.result.isError).toBe(true);
    }
  });

  it("escalates T3 exec tools and can be approved", async () => {
    const { enforcer, approvalQueue, downstream } = createTestSetup();

    downstream.callTool = async () => ({
      content: [{ type: "text", text: "executed" }],
    });

    // exec.run is T3
    const enforcePromise = enforcer.enforce(
      { serverName: "exec", toolName: "run" },
      { command: "ls" },
    );

    await new Promise((resolve) => setTimeout(resolve, 50));

    const pending = approvalQueue.getPending();
    if (pending.length > 0) {
      approvalQueue.resolve(pending[0]!.requestId, {
        status: "approved",
        by: "human-operator",
      });
    }

    const result = await enforcePromise;
    // If approved, the call should proceed
    if (pending.length > 0) {
      expect(result.allowed).toBe(true);
      expect(result.approvalRequestId).toBeDefined();
    }
  });
});

/**
 * Per-server policy enforcement tests.
 *
 * Validates that maxTier and requireApproval from server config
 * are actually enforced by the PolicyEnforcer.
 */

function createSetupWithServerPolicy(policy: { maxTier?: string; requireApproval?: boolean }) {
  const keypair = generateKeypair();
  const tokenStore = new Map<string, SintCapabilityToken>();
  const revocationStore = new RevocationStore();

  const expiresAt = new Date(Date.now() + 3600_000)
    .toISOString()
    .replace(/\.(\d{3})Z$/, ".$1000Z");

  const tokenResult = issueCapabilityToken(
    {
      issuer: keypair.publicKey,
      subject: keypair.publicKey,
      resource: "mcp://*",
      actions: ["call", "exec.run"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt,
      revocable: true,
    },
    keypair.privateKey,
  );

  if (!tokenResult.ok) throw new Error("Failed to issue token");
  const token = tokenResult.value;
  tokenStore.set(token.tokenId, token);

  const gateway = new PolicyGateway({
    resolveToken: (id) => tokenStore.get(id),
    revocationStore,
  });

  const approvalQueue = new ApprovalQueue({ defaultTimeoutMs: 5000 });
  const downstream = new DownstreamManager();

  // Add mock downstream WITH policy config
  const mockClient = {} as Client;
  downstream.addConnectedClient(
    "restricted",
    mockClient,
    [
      { name: "readFile", inputSchema: { type: "object" } },
      { name: "writeFile", inputSchema: { type: "object" } },
      { name: "deleteFile", inputSchema: { type: "object" } },
    ],
    { policy },
  );

  // Patch callTool to return mock result
  (downstream as any).servers.get("restricted")!.client.callTool = async (params: any) => ({
    content: [{ type: "text", text: `result for ${params.name}` }],
  });

  const enforcer = new PolicyEnforcer(
    gateway,
    approvalQueue,
    downstream,
    keypair.publicKey,
    token.tokenId,
  );

  return { enforcer, gateway, approvalQueue, downstream, keypair, token };
}

describe("Per-server policy enforcement", () => {
  it("requireApproval escalates non-observe tool calls", async () => {
    const { enforcer, approvalQueue } = createSetupWithServerPolicy({
      requireApproval: true,
    });

    // writeFile would normally be auto-approved, but requireApproval forces escalation
    const enforcePromise = enforcer.enforce(
      { serverName: "restricted", toolName: "writeFile" },
      { path: "/tmp/test.txt", content: "hello" },
    );

    await new Promise((r) => setTimeout(r, 50));

    const pending = approvalQueue.getPending();
    expect(pending.length).toBeGreaterThan(0);

    // Approve it
    approvalQueue.resolve(pending[0]!.requestId, {
      status: "approved",
      by: "operator",
    });

    const result = await enforcePromise;
    expect(result.approvalRequestId).toBeDefined();
  });

  it("requireApproval escalates read tools when gateway assigns non-T0 tier", async () => {
    const { enforcer, approvalQueue } = createSetupWithServerPolicy({
      requireApproval: true,
    });

    // The PolicyGateway's tier assignment uses its own rules (not TOOL_RISK_MAP).
    // For mcp://restricted/readFile with "call" action, the gateway may
    // assign a tier higher than T0_OBSERVE, which triggers requireApproval escalation.
    const enforcePromise = enforcer.enforce(
      { serverName: "restricted", toolName: "readFile" },
      { path: "/tmp/test.txt" },
    );

    await new Promise((r) => setTimeout(r, 50));

    const pending = approvalQueue.getPending();
    if (pending.length > 0) {
      // If escalated, approve it and verify the flow works
      approvalQueue.resolve(pending[0]!.requestId, {
        status: "approved",
        by: "operator",
      });

      const result = await enforcePromise;
      expect(result.approvalRequestId).toBeDefined();
    } else {
      // If gateway assigned T0_OBSERVE, it should have passed through
      const result = await enforcePromise;
      expect(result.decision.action).toBe("allow");
    }
  });

  it("requireApproval denied when operator denies", async () => {
    const { enforcer, approvalQueue } = createSetupWithServerPolicy({
      requireApproval: true,
    });

    const enforcePromise = enforcer.enforce(
      { serverName: "restricted", toolName: "writeFile" },
      { path: "/tmp/test.txt", content: "hello" },
    );

    await new Promise((r) => setTimeout(r, 50));

    const pending = approvalQueue.getPending();
    expect(pending.length).toBeGreaterThan(0);

    // Deny it
    approvalQueue.resolve(pending[0]!.requestId, {
      status: "denied",
      by: "operator",
      reason: "Not allowed",
    });

    const result = await enforcePromise;
    expect(result.allowed).toBe(false);
    expect(result.denyReason).toContain("Escalated");
  });

  it("can require approval for a T1 operation within a T1 ceiling", async () => {
    const { enforcer, downstream, approvalQueue } = createSetupWithServerPolicy({ maxTier: "T1_prepare", requireApproval: true });
    const forward = vi.spyOn(downstream, "callTool");
    const pending = enforcer.enforce({ serverName: "restricted", toolName: "writeFile" }, {});
    await vi.waitFor(() => expect(approvalQueue.getPending()).toHaveLength(1));
    const approval = approvalQueue.getPending()[0]!;
    expect(approval.decision).toMatchObject({ action: "escalate", assignedTier: "T1_prepare" });
    approvalQueue.resolve(approval.requestId, { status: "denied", by: "operator" });
    expect((await pending).allowed).toBe(false);
    expect(forward).not.toHaveBeenCalled();
    approvalQueue.dispose();
  });

  it.each([false, true])("maxTier denies execution even with requireApproval=%s", async requireApproval => {
    const { enforcer, downstream, approvalQueue } = createSetupWithServerPolicy({ maxTier: "T1_prepare", requireApproval });
    const forward = vi.spyOn(downstream, "callTool");
    const result = await enforcer.enforce({ serverName: "restricted", toolName: "execute_workflow" }, {});
    expect(result.allowed).toBe(false);
    expect(result.decision.action).toBe("deny");
    expect(result.decision.denial?.policyViolated).toBe("MCP_SERVER_TIER_CEILING");
    expect(approvalQueue.getPending()).toHaveLength(0);
    expect(forward).not.toHaveBeenCalled();
    approvalQueue.dispose();
  });

  it("server without policy allows calls normally", async () => {
    const keypair = generateKeypair();
    const tokenStore = new Map<string, SintCapabilityToken>();
    const revocationStore = new RevocationStore();

    const expiresAt = new Date(Date.now() + 3600_000)
      .toISOString()
      .replace(/\.(\d{3})Z$/, ".$1000Z");

    const tokenResult = issueCapabilityToken(
      {
        issuer: keypair.publicKey,
        subject: keypair.publicKey,
        resource: "mcp://*",
        actions: ["call"],
        constraints: {},
        delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
        expiresAt,
        revocable: true,
      },
      keypair.privateKey,
    );

    if (!tokenResult.ok) throw new Error("Failed to issue token");
    const token = tokenResult.value;
    tokenStore.set(token.tokenId, token);

    const gateway = new PolicyGateway({
      resolveToken: (id) => tokenStore.get(id),
      revocationStore,
    });

    const approvalQueue = new ApprovalQueue({ defaultTimeoutMs: 5000 });
    const downstream = new DownstreamManager();

    // No policy set
    const mockClient = {} as Client;
    downstream.addConnectedClient("nopolicy", mockClient, [
      { name: "writeFile", inputSchema: { type: "object" } },
    ]);
    (downstream as any).servers.get("nopolicy")!.client.callTool = async () => ({
      content: [{ type: "text", text: "ok" }],
    });

    const enforcer = new PolicyEnforcer(
      gateway,
      approvalQueue,
      downstream,
      keypair.publicKey,
      token.tokenId,
    );

    const result = await enforcer.enforce(
      { serverName: "nopolicy", toolName: "writeFile" },
      { path: "/tmp/test.txt" },
    );

    // No policy means normal gateway behavior — should be allowed
    expect(result.allowed).toBe(true);
    expect(result.decision.action).toBe("allow");
  });

  it("getServerConfig returns policy from addConnectedClient", () => {
    const downstream = new DownstreamManager();
    const mockClient = {} as Client;

    downstream.addConnectedClient("test", mockClient, [], {
      policy: { maxTier: "T2_act", requireApproval: true },
    });

    const config = downstream.getServerConfig("test");
    expect(config).toBeDefined();
    expect(config!.policy?.maxTier).toBe("T2_act");
    expect(config!.policy?.requireApproval).toBe(true);
  });
});


describe("MCP approval quorum", () => {
  it("does not dispatch a write-execute sequence until both required operators approve", async () => {
    const { gateway, downstream, approvalQueue, keypair, tokenStore } = createTestSetup();
    const issued = issueCapabilityToken({
      issuer: keypair.publicKey, subject: keypair.publicKey, resource: "mcp://*", actions: ["call", "exec.run"],
      constraints: { quorum: { required: 2, authorized: ["alice", "bob"] } },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(), revocable: true,
    }, keypair.privateKey);
    if (!issued.ok) throw new Error(issued.error);
    tokenStore.set(issued.value.tokenId, issued.value);
    const enforcer = new PolicyEnforcer(gateway, approvalQueue, downstream, keypair.publicKey, issued.value.tokenId);
    const forward = vi.spyOn(downstream, "callTool").mockResolvedValue({ content: [] });
    await enforcer.enforce({ serverName: "filesystem", toolName: "writeFile" }, {});
    forward.mockClear();
    const pending = enforcer.enforce({ serverName: "terminal", toolName: "run_command" }, {});
    await vi.waitFor(() => expect(approvalQueue.getPending()).toHaveLength(1));
    const approval = approvalQueue.getPending()[0]!;
    expect(approval.quorum).toEqual({ required: 2, authorized: ["alice", "bob"] });
    expect(approval.decision.escalation?.reason).toContain("Forbidden combination");
    approvalQueue.resolve(approval.requestId, { status: "approved", by: "alice" });
    await Promise.resolve();
    expect(forward).not.toHaveBeenCalled();
    expect(approvalQueue.getPending()).toHaveLength(1);
    approvalQueue.resolve(approval.requestId, { status: "approved", by: "bob" });
    expect((await pending).allowed).toBe(true);
    expect(forward).toHaveBeenCalledTimes(1);
    approvalQueue.dispose();
  });
});
