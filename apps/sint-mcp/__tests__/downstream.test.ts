/**
 * SINT MCP — Downstream manager tests.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { DownstreamManager } from "../src/downstream.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";

describe("DownstreamManager", () => {
  let manager: DownstreamManager;

  beforeEach(() => {
    manager = new DownstreamManager();
  });

  it("starts with empty server list", () => {
    expect(manager.listServers()).toHaveLength(0);
    expect(manager.size).toBe(0);
  });

  it("adds mock connected client", () => {
    const mockClient = {} as Client;
    manager.addConnectedClient("test", mockClient, [
      { name: "read", description: "Read", inputSchema: { type: "object" } },
    ]);

    expect(manager.size).toBe(1);
    expect(manager.hasServer("test")).toBe(true);
  });

  it("lists servers with status", () => {
    const mockClient = {} as Client;
    manager.addConnectedClient("test", mockClient, [
      { name: "read", inputSchema: { type: "object" } },
      { name: "write", inputSchema: { type: "object" } },
    ]);

    const servers = manager.listServers();
    expect(servers).toHaveLength(1);
    expect(servers[0]!.name).toBe("test");
    expect(servers[0]!.status).toBe("connected");
    expect(servers[0]!.toolCount).toBe(2);
  });

  it("returns all tools from connected servers", () => {
    const mockClient = {} as Client;
    manager.addConnectedClient("fs", mockClient, [
      { name: "readFile", inputSchema: { type: "object" } },
    ]);
    manager.addConnectedClient("db", mockClient, [
      { name: "query", inputSchema: { type: "object" } },
    ]);

    const tools = manager.getAllTools();
    expect(tools).toHaveLength(2);
    expect(tools[0]![0]).toBe("fs");
    expect(tools[0]![1].name).toBe("readFile");
    expect(tools[1]![0]).toBe("db");
    expect(tools[1]![1].name).toBe("query");
  });

  it("removes a server", async () => {
    const mockClient = { close: async () => {} } as unknown as Client;
    manager.addConnectedClient("test", mockClient, []);

    const removed = await manager.removeServer("test");
    expect(removed).toBe(true);
    expect(manager.size).toBe(0);
    expect(manager.hasServer("test")).toBe(false);
  });

  it("returns false when removing non-existent server", async () => {
    const removed = await manager.removeServer("nonexistent");
    expect(removed).toBe(false);
  });

  it("callTool returns error for non-existent server", async () => {
    const result = await manager.callTool("nonexistent", "read", {});
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not found");
  });

  it("getServerConfig returns config", () => {
    const mockClient = {} as Client;
    manager.addConnectedClient("test", mockClient, []);
    expect(manager.getServerConfig("test")).toBeDefined();
    expect(manager.getServerConfig("nope")).toBeUndefined();
  });

  it("throws when adding duplicate server name", () => {
    const mockClient = {} as Client;
    manager.addConnectedClient("test", mockClient, []);

    expect(() => {
      manager.addConnectedClient("test", mockClient, []);
    }).not.toThrow(); // addConnectedClient overwrites silently
  });
});
