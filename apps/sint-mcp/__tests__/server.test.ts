/**
 * SINT MCP — Server integration tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { SintMCPServer } from "../src/server.js";
import type { SintMCPConfig } from "../src/config.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { generateUUIDv7, nowISO8601 } from "@pshkv/gate-capability-tokens";

const defaultConfig: SintMCPConfig = {
  servers: {},
  defaultPolicy: "cautious",
  approvalTimeoutMs: 5000,
  transport: "stdio",
  port: 3200,
};

describe("SintMCPServer", () => {
  let server: SintMCPServer;

  beforeEach(() => {
    server = new SintMCPServer(defaultConfig);
  });

  afterEach(async () => {
    await server.dispose();
  });

  it("creates server instance", () => {
    expect(server).toBeDefined();
    expect(server.server).toBeDefined();
    expect(server.downstream).toBeDefined();
    expect(server.aggregator).toBeDefined();
  });

  it("initializes with agent identity", async () => {
    await server.initialize();
    const identity = server.getIdentity();
    expect(identity).toBeDefined();
    expect(identity!.publicKey).toBeTruthy();
    expect(identity!.privateKey).toBeTruthy();
    expect(identity!.defaultToken).toBeDefined();
    expect(identity!.defaultToken.tokenId).toBeTruthy();
  });

  it("stores default token on init", async () => {
    await server.initialize();
    const identity = server.getIdentity()!;
    const token = server.tokenStore.get(identity.defaultToken.tokenId);
    expect(token).toBeDefined();
    expect(token!.subject).toBe(identity.publicKey);
    expect(token!.resource).toBe("mcp://sint/*");
  });

  it("isolates configured downstreams with separate scoped tokens", async () => {
    const scoped = new SintMCPServer({ ...defaultConfig, servers: {
      filesystem: { command: "node" }, github: { command: "node" },
    } });
    vi.spyOn(scoped.downstream, "addServer").mockResolvedValue(undefined);
    await scoped.initialize();
    const tokens = [...scoped.tokenStore.values()];
    expect(tokens.map(token => token.resource).sort()).toEqual([
      "mcp://filesystem/*", "mcp://github/*", "mcp://sint/*",
    ]);
    const fsToken = tokens.find(token => token.resource === "mcp://filesystem/*")!;
    const denied = await scoped.gateway.intercept({
      requestId: generateUUIDv7(), timestamp: nowISO8601(),
      agentId: scoped.getIdentity()!.publicKey, tokenId: fsToken.tokenId,
      resource: "mcp://github/readFile", action: "call", params: {},
    });
    expect(denied.action).toBe("deny");
    await scoped.dispose();
  });

  it("initializes SINT components", () => {
    expect(server.gateway).toBeDefined();
    expect(server.approvalQueue).toBeDefined();
    expect(server.ledger).toBeDefined();
    expect(server.tokenStore).toBeDefined();
    expect(server.revocationStore).toBeDefined();
  });

  it("starts with empty downstream list", () => {
    const servers = server.downstream.listServers();
    expect(servers).toHaveLength(0);
  });

  it("aggregator returns empty tools when no downstreams", () => {
    const tools = server.aggregator.listTools();
    expect(tools).toHaveLength(0);
  });

  it("can add mock downstream after init", async () => {
    await server.initialize();

    const mockClient = {} as Client;
    server.downstream.addConnectedClient("mock", mockClient, [
      { name: "hello", description: "Say hello", inputSchema: { type: "object" } },
    ]);
    server.aggregator.refresh();

    const tools = server.aggregator.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe("mock__hello");
  });

  it("never exposes or executes agent self-approval and token minting", async () => {
    await server.initialize();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "security-test", version: "1" }, { capabilities: {} });
    await server.server.connect(serverTransport);
    await client.connect(clientTransport);
    const tools = await client.listTools();
    expect(tools.tools.map(tool => tool.name)).not.toContain("sint__approve");
    expect(tools.tools.map(tool => tool.name)).not.toContain("sint__issue_token");
    const approval = await client.callTool({ name: "sint__approve", arguments: { requestId: "fake", by: "agent" } });
    expect(approval.isError).toBe(true);
    const mint = await client.callTool({ name: "sint__issue_token", arguments: {
      subject: server.getIdentity()!.publicKey, resource: "mcp://*", actions: ["call", "exec.run"],
    } });
    expect(mint.isError).toBe(true);
    expect(server.tokenStore.size).toBe(1);
    expect(server.ledger.length).toBeGreaterThanOrEqual(2);
    await client.close();
  });
});
