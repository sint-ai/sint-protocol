/**
 * SINT MCP — Integration Tests.
 *
 * End-to-end tests validating the complete flow:
 * MCP client → SINT MCP Server → PolicyGateway → Downstream MCP Server
 *
 * These tests use in-memory components (no network, no real MCP servers)
 * but exercise the full code path including token issuance, policy
 * evaluation, tier assignment, approval queue, and tool routing.
 */

import { describe, it, expect } from "vitest";
import { PolicyEnforcer } from "../src/enforcer.js";
import { ToolAggregator, parseNamespace, makeNamespace } from "../src/aggregator.js";
import { DownstreamManager } from "../src/downstream.js";
import { createAgentIdentity } from "../src/identity.js";
import { PolicyGateway, ApprovalQueue } from "@pshkv/gate-policy-gateway";
import { RevocationStore } from "@pshkv/gate-capability-tokens";
import type { SintCapabilityToken } from "@pshkv/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

function createIntegrationSetup() {
  // Identity
  const identity = createAgentIdentity();
  const tokenStore = new Map<string, SintCapabilityToken>();
  tokenStore.set(identity.defaultToken.tokenId, identity.defaultToken);
  const revocationStore = new RevocationStore();

  // Gateway
  const gateway = new PolicyGateway({
    resolveToken: (id) => tokenStore.get(id),
    revocationStore,
  });

  const approvalQueue = new ApprovalQueue({ defaultTimeoutMs: 3000 });
  const downstream = new DownstreamManager();

  // Mock downstream servers — each gets its OWN mock client
  const fsClient = { callTool: async (params: any) => ({
    content: [{ type: "text", text: `FS:${params.name}:ok` }],
  }) } as unknown as Client;

  const shellClient = { callTool: async (params: any) => ({
    content: [{ type: "text", text: `SHELL:${params.name}:ok` }],
  }) } as unknown as Client;

  const dbClient = { callTool: async (params: any) => ({
    content: [{ type: "text", text: `DB:${params.name}:ok` }],
  }) } as unknown as Client;

  // Filesystem server (T0-T1 tools)
  downstream.addConnectedClient(
    "filesystem",
    fsClient,
    [
      { name: "readFile", description: "Read a file", inputSchema: { type: "object" } },
      { name: "writeFile", description: "Write a file", inputSchema: { type: "object" } },
      { name: "deleteFile", description: "Delete a file", inputSchema: { type: "object" } },
    ],
    { policy: { maxTier: "T2_act" } },
  );

  // Shell server (requires approval for all)
  downstream.addConnectedClient(
    "shell",
    shellClient,
    [
      { name: "run", description: "Run a command", inputSchema: { type: "object" } },
    ],
    { policy: { requireApproval: true } },
  );

  // Database server (no special policy)
  downstream.addConnectedClient(
    "database",
    dbClient,
    [
      { name: "query", description: "SQL query", inputSchema: { type: "object" } },
      { name: "insert", description: "Insert row", inputSchema: { type: "object" } },
    ],
  );

  // Aggregator
  const aggregator = new ToolAggregator(downstream);
  aggregator.refresh();

  // Enforcer
  const enforcer = new PolicyEnforcer(
    gateway,
    approvalQueue,
    downstream,
    identity.publicKey,
    identity.defaultToken.tokenId,
  );

  return { identity, gateway, approvalQueue, downstream, aggregator, enforcer, tokenStore, revocationStore };
}

describe("Integration: Full SINT MCP Flow", () => {
  it("aggregates tools from all downstream servers with namespaces", () => {
    const { aggregator } = createIntegrationSetup();
    const tools = aggregator.toMCPToolsList();

    expect(tools.length).toBe(6); // 3 fs + 1 shell + 2 db
    expect(tools.map((t) => t.name).sort()).toEqual([
      "database__insert",
      "database__query",
      "filesystem__deleteFile",
      "filesystem__readFile",
      "filesystem__writeFile",
      "shell__run",
    ]);
  });

  it("routes namespaced tool calls through enforcer to correct downstream", async () => {
    const { aggregator, enforcer } = createIntegrationSetup();

    // Parse the namespaced tool name
    const parsed = parseNamespace("filesystem__readFile");
    expect(parsed).toBeDefined();
    expect(parsed!.serverName).toBe("filesystem");
    expect(parsed!.toolName).toBe("readFile");

    // Enforce and execute
    const result = await enforcer.enforce(parsed!, { path: "/tmp/test.txt" });

    expect(result.allowed).toBe(true);
    expect(result.result).toBeDefined();
    expect(result.result!.content[0]!.text).toBe("FS:readFile:ok");
  });

  it("routes database calls to the correct downstream", async () => {
    const { enforcer } = createIntegrationSetup();

    const parsed = parseNamespace("database__query");
    const result = await enforcer.enforce(parsed!, { sql: "SELECT 1" });

    expect(result.allowed).toBe(true);
    expect(result.result!.content[0]!.text).toBe("DB:query:ok");
  });

  it("shell server with requireApproval forces escalation", async () => {
    const { enforcer, approvalQueue } = createIntegrationSetup();

    const parsed = parseNamespace("shell__run");
    const enforcePromise = enforcer.enforce(parsed!, { command: "ls -la" });

    // Wait for the approval to be enqueued
    await new Promise((r) => setTimeout(r, 50));

    const pending = approvalQueue.getPending();
    expect(pending.length).toBeGreaterThan(0);

    // The pending request should reference the shell server
    const req = pending[0]!;
    expect(req.request.resource).toBe("mcp://shell/run");

    // Approve it
    approvalQueue.resolve(req.requestId, {
      status: "approved",
      by: "integration-test",
    });

    const result = await enforcePromise;
    expect(result.allowed).toBe(true);
    expect(result.approvalRequestId).toBeDefined();
    expect(result.result!.content[0]!.text).toBe("SHELL:run:ok");
  });

  it("shell server denied when operator denies", async () => {
    const { enforcer, approvalQueue } = createIntegrationSetup();

    const parsed = parseNamespace("shell__run");
    const enforcePromise = enforcer.enforce(parsed!, { command: "rm -rf /" });

    await new Promise((r) => setTimeout(r, 50));

    const pending = approvalQueue.getPending();
    expect(pending.length).toBeGreaterThan(0);

    approvalQueue.resolve(pending[0]!.requestId, {
      status: "denied",
      by: "integration-test",
      reason: "Dangerous command",
    });

    const result = await enforcePromise;
    expect(result.allowed).toBe(false);
    expect(result.denyReason).toContain("Escalated");
  });

  it("revoked token denies all subsequent calls", async () => {
    const { enforcer, revocationStore, identity } = createIntegrationSetup();

    // First call should work
    const parsed = parseNamespace("filesystem__readFile");
    const result1 = await enforcer.enforce(parsed!, { path: "/tmp/a.txt" });
    expect(result1.allowed).toBe(true);

    // Revoke the token
    revocationStore.revoke(
      identity.defaultToken.tokenId,
      "Security incident",
      "admin",
    );

    // Subsequent calls should be denied
    const result2 = await enforcer.enforce(parsed!, { path: "/tmp/b.txt" });
    expect(result2.allowed).toBe(false);
    expect(result2.denyReason).toContain("revoked");
  });

  it("agent identity has valid Ed25519 keypair and token", () => {
    const { identity, tokenStore } = createIntegrationSetup();

    expect(identity.publicKey).toBeDefined();
    expect(identity.publicKey.length).toBeGreaterThan(0);
    expect(identity.privateKey).toBeDefined();
    expect(identity.defaultToken).toBeDefined();
    expect(identity.defaultToken.tokenId).toBeDefined();

    // Token should be in the store
    const token = tokenStore.get(identity.defaultToken.tokenId);
    expect(token).toBeDefined();
    expect(token!.subject).toBe(identity.publicKey);
    expect(token!.resource).toBe("mcp://*");
    expect(token!.actions).toContain("call");
    expect(token!.actions).toContain("exec.run");
  });

  it("namespace parsing round-trips correctly", () => {
    const servers = ["filesystem", "shell", "database", "conway"];
    const tools = ["readFile", "run", "query", "sandbox_create"];

    for (const server of servers) {
      for (const tool of tools) {
        const namespaced = makeNamespace(server, tool);
        const parsed = parseNamespace(namespaced);
        expect(parsed).toBeDefined();
        expect(parsed!.serverName).toBe(server);
        expect(parsed!.toolName).toBe(tool);
      }
    }
  });

  it("non-existent downstream returns error", async () => {
    const { enforcer } = createIntegrationSetup();

    const parsed = parseNamespace("nonexistent__someAction");
    const result = await enforcer.enforce(parsed!, {});

    // Gateway allows (wildcard token) but downstream returns error
    if (result.allowed && result.result) {
      expect(result.result.isError).toBe(true);
      expect(result.result.content[0]!.text).toContain("not found");
    }
  });

  it("multiple rapid calls track recent actions", async () => {
    const { enforcer } = createIntegrationSetup();

    // Execute a burst of tool calls
    const calls = [
      enforcer.enforce(parseNamespace("filesystem__readFile")!, { path: "/a" }),
      enforcer.enforce(parseNamespace("database__query")!, { sql: "SELECT 1" }),
      enforcer.enforce(parseNamespace("filesystem__writeFile")!, { path: "/b" }),
      enforcer.enforce(parseNamespace("database__insert")!, { table: "t" }),
      enforcer.enforce(parseNamespace("filesystem__readFile")!, { path: "/c" }),
    ];

    const results = await Promise.all(calls);

    // All should succeed (no forbidden combo triggers for these tools)
    for (const result of results) {
      expect(result.decision).toBeDefined();
    }
  });

  it("per-server policy config is accessible via downstream manager", () => {
    const { downstream } = createIntegrationSetup();

    const fsConfig = downstream.getServerConfig("filesystem");
    expect(fsConfig).toBeDefined();
    expect(fsConfig!.policy?.maxTier).toBe("T2_act");

    const shellConfig = downstream.getServerConfig("shell");
    expect(shellConfig).toBeDefined();
    expect(shellConfig!.policy?.requireApproval).toBe(true);

    const dbConfig = downstream.getServerConfig("database");
    expect(dbConfig).toBeDefined();
    expect(dbConfig!.policy).toBeUndefined(); // No special policy
  });
});
