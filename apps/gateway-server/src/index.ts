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

const config = loadConfig();
const ctx = createPersistentContext(config);
const app = createApp(ctx, {
  apiKey: config.apiKey,
  requireSignatures: config.requireSignatures,
  rateLimitMax: config.rateLimitMax,
});

serve({ fetch: app.fetch, port: config.port }, (info) => {
  console.log(`
  ╔═══════════════════════════════════════════════╗
  ║         SINT GATE — Policy Gateway            ║
  ║         Security Wedge for Physical AI        ║
  ╠═══════════════════════════════════════════════╣
  ║  Server:  http://localhost:${info.port}              ║
  ║  Health:  http://localhost:${info.port}/v1/health     ║
  ║  Store:   ${config.store.padEnd(35)}║
  ║  Cache:   ${config.cache.padEnd(35)}║
  ╚═══════════════════════════════════════════════╝
  `);
});
