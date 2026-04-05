/**
 * SINT Gate — Standalone Policy Gateway HTTP Server.
 *
 * Exposes the Policy Gateway as an HTTP API using Hono.
 * This is the entry point for deploying SINT Gate as a service.
 *
 * @module @sint/gateway-server
 */

import { serve } from "@hono/node-server";
import { createApp, createPersistentContext } from "./server.js";
import { loadConfig } from "./config.js";
import { attachApprovalsWebSocket } from "./ws/approvals-websocket.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const ctx = await createPersistentContext(config);
  const app = createApp(ctx, {
    apiKey: config.apiKey,
    requireSignatures: config.requireSignatures,
    rateLimitMax: config.rateLimitMax,
  });

  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`
  ╔═══════════════════════════════════════════════╗
  ║         SINT GATE — Policy Gateway            ║
  ║         Security Wedge for Physical AI        ║
  ╠═══════════════════════════════════════════════╣
  ║  Server:  http://localhost:${info.port}              ║
  ║  Health:  http://localhost:${info.port}/v1/health     ║
  ║  Approvals SSE: http://localhost:${info.port}/v1/approvals/events ║
  ║  Approvals WS:  ws://localhost:${info.port}/v1/approvals/ws ║
  ║  Store:   ${config.store.padEnd(35)}║
  ║  Cache:   ${config.cache.padEnd(35)}║
  ╚═══════════════════════════════════════════════╝
  `);
  });

  // WebSocket approval transport (Issue #2): low-latency queue updates.
  attachApprovalsWebSocket(server as any, ctx, { apiKey: config.apiKey });
}

void main().catch((err) => {
  console.error("[SINT] gateway startup failed", err);
  process.exit(1);
});
