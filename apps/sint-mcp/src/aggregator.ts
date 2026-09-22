/**
 * SINT MCP — Tool Aggregator.
 *
 * Collects tools from all downstream MCP servers, namespaces them,
 * and exposes them through the SINT MCP server's tools/list handler.
 *
 * Namespace format: {serverName}__{toolName}
 * Example: filesystem__readFile, github__create_issue
 *
 * @module sint-mcp/aggregator
 */

import type { DownstreamManager, DownstreamTool } from "./downstream.js";

/** Separator used between server name and tool name. */
export const NAMESPACE_SEPARATOR = "__";

/** A namespaced tool exposed to the upstream MCP client. */
export interface NamespacedTool {
  /** Full namespaced name: serverName__toolName. */
  readonly name: string;
  /** Original tool name on the downstream server. */
  readonly originalName: string;
  /** Which downstream server this tool belongs to. */
  readonly serverName: string;
  /** Tool description (includes server context). */
  readonly description: string;
  /** JSON Schema for the tool's input. */
  readonly inputSchema: Record<string, unknown>;
}

/** Parsed namespace from a tool call. */
export interface ParsedNamespace {
  readonly serverName: string;
  readonly toolName: string;
}

/**
 * Parse a namespaced tool name into server name and tool name.
 *
 * @example
 * ```ts
 * parseNamespace("filesystem__readFile")
 * // => { serverName: "filesystem", toolName: "readFile" }
 * ```
 */
export function parseNamespace(namespacedName: string): ParsedNamespace | undefined {
  const idx = namespacedName.indexOf(NAMESPACE_SEPARATOR);
  if (idx === -1) return undefined;

  return {
    serverName: namespacedName.slice(0, idx),
    toolName: namespacedName.slice(idx + NAMESPACE_SEPARATOR.length),
  };
}

/**
 * Create a namespaced tool name.
 */
export function makeNamespace(serverName: string, toolName: string): string {
  return `${serverName}${NAMESPACE_SEPARATOR}${toolName}`;
}

/**
 * Tool Aggregator — collects and namespaces tools from all downstreams.
 *
 * @example
 * ```ts
 * const aggregator = new ToolAggregator(downstreamManager);
 * const tools = aggregator.listTools();
 * // => [{ name: "filesystem__readFile", ... }, { name: "github__create_issue", ... }]
 * ```
 */
export class ToolAggregator {
  private cachedTools: NamespacedTool[] = [];

  constructor(private readonly downstream: DownstreamManager) {}

  /**
   * Refresh the aggregated tool list from all downstreams.
   */
  refresh(): NamespacedTool[] {
    const allTools = this.downstream.getAllTools();
    this.cachedTools = allTools.map(([serverName, tool]) =>
      this.namespaceAsTool(serverName, tool),
    );
    return this.cachedTools;
  }

  /**
   * Get all namespaced tools (uses cache, call refresh() to update).
   */
  listTools(): NamespacedTool[] {
    if (this.cachedTools.length === 0) {
      return this.refresh();
    }
    return this.cachedTools;
  }

  /**
   * Get tools for a specific server.
   */
  getServerTools(serverName: string): NamespacedTool[] {
    return this.listTools().filter((t) => t.serverName === serverName);
  }

  /**
   * Convert aggregated tools to MCP tools/list response format.
   */
  toMCPToolsList(): Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }> {
    return this.listTools().map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    }));
  }

  /**
   * Route a tool call to the correct downstream server.
   */
  async routeCall(
    namespacedName: string,
    args: Record<string, unknown>,
  ): Promise<{ content: Array<{ type: string; text?: string }>; isError?: boolean }> {
    const parsed = parseNamespace(namespacedName);
    if (!parsed) {
      return {
        content: [{
          type: "text",
          text: `Invalid tool name "${namespacedName}". Expected format: serverName__toolName`,
        }],
        isError: true,
      };
    }

    return this.downstream.callTool(parsed.serverName, parsed.toolName, args);
  }

  private namespaceAsTool(serverName: string, tool: DownstreamTool): NamespacedTool {
    return {
      name: makeNamespace(serverName, tool.name),
      originalName: tool.name,
      serverName,
      description: tool.description
        ? `[${serverName}] ${tool.description}`
        : `[${serverName}] ${tool.name}`,
      inputSchema: tool.inputSchema,
    };
  }
}
