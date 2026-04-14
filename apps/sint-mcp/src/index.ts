#!/usr/bin/env node
/**
 * SINT MCP — Entry Point.
 *
 * Security-first multi-MCP proxy server.
 * Connects to multiple downstream MCP servers and enforces
 * SINT policy on every tool call.
 *
 * Usage:
 *   npx sint-mcp                            # stdio, default config
 *   npx sint-mcp --sse --port 3200         # SSE remote
 *   npx sint-mcp --config ./config.json     # custom config
 *
 * @module @sint/mcp
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";
import { loadConfig } from "./config.js";
import { SintMCPServer } from "./server.js";

let activeServer: SintMCPServer | null = null;
let trajectoryFlushed = false;

async function flushTrajectory(outcome: "success" | "failure" | "partial" | "timeout"): Promise<void> {
  if (!activeServer || trajectoryFlushed) return;
  try {
    const filePath = await activeServer.finalizeTrajectory(outcome);
    trajectoryFlushed = true;
    console.error(`  Trajectory: ${filePath}`);
  } catch (err) {
    console.error("  Failed to flush trajectory:", err);
  }
}

async function main(): Promise<void> {
  const config = loadConfig();

  // Banner
  console.error("╔══════════════════════════════════════╗");
  console.error("║   🛡️  SINT MCP — Security Proxy      ║");
  console.error("║   Multi-MCP Policy Enforcement       ║");
  console.error("╚══════════════════════════════════════╝");
  console.error(`  Transport: ${config.transport}`);
  console.error(`  Servers:   ${Object.keys(config.servers).length} configured`);
  console.error(`  Policy:    ${config.defaultPolicy}`);
  console.error("");

  // Create and initialize server
  const sintMCP = new SintMCPServer(config);
  activeServer = sintMCP;
  await sintMCP.initialize();

  const identity = sintMCP.getIdentity();
  if (identity) {
    console.error(`  Agent:     ${identity.publicKey.slice(0, 16)}...`);
    console.error(`  Token:     ${identity.defaultToken.tokenId.slice(0, 8)}...`);
  }

  const servers = sintMCP.downstream.listServers();
  const connected = servers.filter((s) => s.status === "connected");
  console.error(`  Connected: ${connected.length}/${servers.length} servers`);

  const sintToolCount = sintMCP.getSintToolCount();
  const totalTools = connected.reduce((sum, s) => sum + s.toolCount, 0);
  console.error(`  Tools:     ${totalTools} aggregated + ${sintToolCount} SINT built-in`);
  console.error("");

  // Connect transport
  if (config.transport === "stdio") {
    const transport = new StdioServerTransport();
    await sintMCP.server.connect(transport);
    console.error("  ✓ Listening on stdio");
  } else {
    // Streamable HTTP transport (SSE + HTTP POST)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    await sintMCP.server.connect(transport);

    const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? "/";

      // Health check endpoint
      if (url === "/health" && req.method === "GET") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", transport: "streamable-http" }));
        return;
      }

      // MCP endpoint — handle GET (SSE) and POST (JSON-RPC)
      if (url === "/mcp" || url === "/") {
        await transport.handleRequest(req, res);
        return;
      }

      res.writeHead(404);
      res.end("Not found");
    });

    httpServer.listen(config.port, () => {
      console.error(`  ✓ Streamable HTTP on http://localhost:${config.port}/mcp`);
      console.error(`  ✓ Health check at  http://localhost:${config.port}/health`);
    });
  }

  // Graceful shutdown
  process.on("SIGINT", async () => {
    console.error("\n  Shutting down...");
    await flushTrajectory("success");
    await sintMCP.dispose();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await flushTrajectory("success");
    await sintMCP.dispose();
    process.exit(0);
  });
}

main().catch(async (err) => {
  console.error("Fatal error:", err);
  await flushTrajectory("failure");
  if (activeServer) {
    await activeServer.dispose();
  }
  process.exit(1);
});
