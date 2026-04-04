/**
 * SINT MCP — Server integration tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SintMCPServer } from "../src/server.js";
import type { SintMCPConfig } from "../src/config.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

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
});
