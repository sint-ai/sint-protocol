/**
 * SINT Gate — Standalone Policy Gateway HTTP Server.
 *
 * Exposes the Policy Gateway as an HTTP API using Hono.
 * This is the entry point for deploying SINT Gate as a service.
 *
 * Endpoints:
 *   POST /v1/intercept       — Submit a request for policy evaluation
 *   POST /v1/intercept/batch — Batch policy evaluation (207 Multi-Status)
 *   POST /v1/tokens          — Issue a new capability token
 *   POST /v1/tokens/delegate — Delegate a capability token
 *   POST /v1/tokens/revoke   — Revoke a capability token
 *   GET  /v1/ledger          — Query the Evidence Ledger
 *   GET  /v1/health          — Health check
 *   POST /v1/keypair         — Generate a keypair (dev utility)
 *
 * @module @sint/gateway-server
 */

import { serve } from "@hono/node-server";
import { createApp } from "./server.js";

const app = createApp();
const PORT = parseInt(process.env["PORT"] ?? "3100", 10);

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║         SINT GATE — Policy Gateway            ║
  ║         Security Wedge for Physical AI        ║
  ╠═══════════════════════════════════════════════╣
  ║  Server:  http://localhost:${info.port}              ║
  ║  Health:  http://localhost:${info.port}/v1/health     ║
  ╚═══════════════════════════════════════════════╝
  `);
});
