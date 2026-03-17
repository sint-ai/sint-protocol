/**
 * SINT MCP — Downstream MCP Connection Manager.
 *
 * Manages connections to multiple downstream MCP servers.
 * Each downstream is connected via the MCP SDK Client and can
 * be queried for tools and called for tool execution.
 *
 * @module @sint/mcp/downstream
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { DownstreamServerConfig } from "./config.js";

/** Tool schema from a downstream MCP server. */
export interface DownstreamTool {
  /** Original tool name on the downstream server. */
  readonly name: string;
  /** Tool description. */
  readonly description?: string;
  /** JSON Schema for the tool's input. */
  readonly inputSchema: Record<string, unknown>;
}

/** Connection status for a downstream server. */
export type ConnectionStatus = "connected" | "connecting" | "disconnected" | "error";

/** Information about a downstream server. */
export interface DownstreamInfo {
  readonly name: string;
  readonly status: ConnectionStatus;
  readonly toolCount: number;
  readonly config: DownstreamServerConfig;
  readonly error?: string;
}

/** A connected downstream server with its client and cached tools. */
interface DownstreamEntry {
  name: string;
  config: DownstreamServerConfig;
  client: Client;
  transport: StdioClientTransport | null;
  tools: DownstreamTool[];
  status: ConnectionStatus;
  error?: string;
}

/**
 * Manages connections to multiple downstream MCP servers.
 *
 * @example
 * ```ts
 * const manager = new DownstreamManager();
 * await manager.addServer("filesystem", {
 *   command: "npx",
 *   args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
 * });
 *
 * const tools = manager.getAllTools();
 * const result = await manager.callTool("filesystem", "readFile", { path: "/tmp/test.txt" });
 * ```
 */
export class DownstreamManager {
  private readonly servers = new Map<string, DownstreamEntry>();

  /**
   * Add and connect to a downstream MCP server.
   */
  async addServer(name: string, config: DownstreamServerConfig): Promise<void> {
    if (this.servers.has(name)) {
      throw new Error(`Server "${name}" already exists`);
    }

    const client = new Client(
      { name: `sint-mcp-client-${name}`, version: "0.1.0" },
      { capabilities: {} },
    );

    const entry: DownstreamEntry = {
      name,
      config,
      client,
      transport: null,
      tools: [],
      status: "connecting",
    };
    this.servers.set(name, entry);

    try {
      if (config.command) {
        const transport = new StdioClientTransport({
          command: config.command,
          args: config.args ? [...config.args] : [],
          env: config.env
            ? Object.fromEntries(
                Object.entries({ ...process.env, ...config.env })
                  .filter((e): e is [string, string] => e[1] !== undefined),
              )
            : undefined,
        });
        entry.transport = transport;
        await client.connect(transport);
      } else if (config.url) {
        // SSE transport — for now just mark as error since SSE client
        // requires the SSEClientTransport from the SDK
        throw new Error("SSE downstream transport not yet supported");
      } else {
        throw new Error("Server config must specify either command or url");
      }

      // Fetch tools from the downstream
      const toolsResult = await client.listTools();
      entry.tools = (toolsResult.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as Record<string, unknown>,
      }));
      entry.status = "connected";
    } catch (error) {
      entry.status = "error";
      entry.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * Add a pre-connected client (useful for testing).
   */
  addConnectedClient(
    name: string,
    client: Client,
    tools: DownstreamTool[],
    config?: DownstreamServerConfig,
  ): void {
    this.servers.set(name, {
      name,
      config: config ?? {},
      client,
      transport: null,
      tools,
      status: "connected",
    });
  }

  /**
   * Remove and disconnect a downstream server.
   */
  async removeServer(name: string): Promise<boolean> {
    const entry = this.servers.get(name);
    if (!entry) return false;

    try {
      await entry.client.close();
    } catch {
      // Ignore close errors
    }
    this.servers.delete(name);
    return true;
  }

  /**
   * Get all tools from all connected downstream servers.
   * Returns tuples of [serverName, tool].
   */
  getAllTools(): Array<[string, DownstreamTool]> {
    const result: Array<[string, DownstreamTool]> = [];
    for (const entry of this.servers.values()) {
      if (entry.status !== "connected") continue;
      for (const tool of entry.tools) {
        result.push([entry.name, tool]);
      }
    }
    return result;
  }

  /**
   * Call a tool on a specific downstream server.
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ content: Array<{ type: string; text?: string }>; isError?: boolean }> {
    const entry = this.servers.get(serverName);
    if (!entry) {
      return {
        content: [{ type: "text", text: `Server "${serverName}" not found` }],
        isError: true,
      };
    }
    if (entry.status !== "connected") {
      return {
        content: [{ type: "text", text: `Server "${serverName}" is ${entry.status}` }],
        isError: true,
      };
    }

    const result = await entry.client.callTool({ name: toolName, arguments: args });
    return result as { content: Array<{ type: string; text?: string }>; isError?: boolean };
  }

  /**
   * Refresh tools for a specific server.
   */
  async refreshTools(serverName: string): Promise<void> {
    const entry = this.servers.get(serverName);
    if (!entry || entry.status !== "connected") return;

    const toolsResult = await entry.client.listTools();
    entry.tools = (toolsResult.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema as Record<string, unknown>,
    }));
  }

  /**
   * List all servers with their status.
   */
  listServers(): DownstreamInfo[] {
    return Array.from(this.servers.values()).map((entry) => ({
      name: entry.name,
      status: entry.status,
      toolCount: entry.tools.length,
      config: entry.config,
      error: entry.error,
    }));
  }

  /**
   * Get a specific server's config.
   */
  getServerConfig(name: string): DownstreamServerConfig | undefined {
    return this.servers.get(name)?.config;
  }

  /**
   * Check if a server exists.
   */
  hasServer(name: string): boolean {
    return this.servers.has(name);
  }

  /**
   * Get the number of connected servers.
   */
  get size(): number {
    return this.servers.size;
  }

  /**
   * Disconnect all downstream servers.
   */
  async dispose(): Promise<void> {
    const names = Array.from(this.servers.keys());
    await Promise.allSettled(names.map((n) => this.removeServer(n)));
  }
}
