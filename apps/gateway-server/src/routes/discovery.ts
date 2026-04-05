/**
 * SINT Gateway Server — Discovery and schema routes.
 *
 * Exposes machine-readable protocol metadata and schema catalog.
 *
 * Endpoints:
 * - GET /.well-known/sint.json
 * - GET /v1/schemas
 * - GET /v1/schemas/:name
 * - GET /v1/openapi.json
 *
 * @module @sint/gateway-server/routes/discovery
 */

import { Hono } from "hono";
import {
  SINT_PROTOCOL_VERSION,
  SINT_PROTOCOL_BOUNDARY,
  SINT_BRIDGE_PROFILES,
  SINT_SITE_PROFILES,
  SINT_SCHEMA_CATALOG,
  SINT_TIER_COMPLIANCE_CROSSWALK,
} from "@sint/core";

export function discoveryRoutes(): Hono {
  const app = new Hono();

  // OATR domain verification — proves ownership of sint-protocol public key
  // Required by FransDevelopment/open-agent-trust-registry CI pipeline
  app.get("/.well-known/agent-trust.json", (c) => {
    return c.json({
      issuer_id: "sint-protocol",
      public_key_fingerprint: "sint-registry-2026-04",
    });
  });

  app.get("/.well-known/sint.json", (c) => {
    return c.json({
      name: "SINT Protocol",
      version: SINT_PROTOCOL_VERSION,
      boundary: SINT_PROTOCOL_BOUNDARY,
      identityMethods: ["ed25519", "did:key"],
      attestationModes: ["intel-sgx", "arm-trustzone", "amd-sev", "tpm2", "none"],
      deploymentProfiles: SINT_SITE_PROFILES,
      supportedBridges: SINT_BRIDGE_PROFILES,
      schemaCatalog: Object.keys(SINT_SCHEMA_CATALOG).map((name) => ({
        name,
        path: `/v1/schemas/${name}`,
      })),
      complianceCrosswalk: {
        path: "/v1/compliance/tier-crosswalk",
        frameworks: ["nist-ai-rmf-1.0", "iso-iec-42001-2023", "eu-ai-act-2024-1689"],
      },
      approvalTransports: {
        sse: "/v1/approvals/events",
        websocket: "/v1/approvals/ws",
      },
      openapi: "/v1/openapi.json",
    });
  });

  app.get("/v1/schemas", (c) => {
    return c.json({
      total: Object.keys(SINT_SCHEMA_CATALOG).length,
      schemas: Object.keys(SINT_SCHEMA_CATALOG).map((name) => ({
        name,
        path: `/v1/schemas/${name}`,
      })),
    });
  });

  app.get("/v1/schemas/:name", (c) => {
    const name = c.req.param("name");
    const schema = SINT_SCHEMA_CATALOG[name];
    if (!schema) {
      return c.json({
        error: "Schema not found",
        available: Object.keys(SINT_SCHEMA_CATALOG),
      }, 404);
    }
    return c.json(schema);
  });

  app.get("/v1/compliance/tier-crosswalk", (c) => {
    return c.json({
      version: SINT_PROTOCOL_VERSION,
      mappings: SINT_TIER_COMPLIANCE_CROSSWALK,
      disclaimer:
        "Crosswalk is implementation guidance, not legal advice. Validate obligations for your jurisdiction and sector.",
    });
  });

  app.get("/v1/openapi.json", (c) => {
    return c.json({
      openapi: "3.1.0",
      info: {
        title: "SINT Gateway API",
        version: SINT_PROTOCOL_VERSION,
        description: SINT_PROTOCOL_BOUNDARY,
      },
      paths: {
        "/.well-known/sint.json": { get: { summary: "Protocol discovery document" } },
        "/v1/health": { get: { summary: "Health status" } },
        "/v1/metrics": { get: { summary: "Prometheus metrics" } },
        "/v1/intercept": { post: { summary: "Intercept one request" } },
        "/v1/intercept/batch": { post: { summary: "Intercept a batch of requests" } },
        "/v1/tokens": { post: { summary: "Issue capability token" } },
        "/v1/tokens/delegate": { post: { summary: "Delegate capability token" } },
        "/v1/tokens/revoke": { post: { summary: "Revoke capability token" } },
        "/v1/ledger": { get: { summary: "Query evidence ledger" } },
        "/v1/approvals/pending": { get: { summary: "List pending approvals" } },
        "/v1/approvals/events": { get: { summary: "SSE approval stream" } },
        "/v1/approvals/ws": { get: { summary: "WebSocket approval stream (Upgrade)" } },
        "/v1/approvals/{requestId}/resolve": { post: { summary: "Resolve approval" } },
        "/v1/a2a": { post: { summary: "A2A JSON-RPC endpoint" } },
        "/v1/a2a/agents": { get: { summary: "List A2A agents" }, post: { summary: "Register A2A agent" } },
        "/v1/economy/balance/{agentId}": { get: { summary: "Get agent balance (if economy plugin configured)" } },
        "/v1/economy/budget/{agentId}": { get: { summary: "Get agent budget status (if economy plugin configured)" } },
        "/v1/economy/quote": { post: { summary: "Quote action cost (non-billing)" } },
        "/v1/economy/route": { post: { summary: "Cost-aware route selection with optional x402 quotes" } },
        "/v1/economy/events": { get: { summary: "List economy-related ledger events" } },
        "/v1/schemas": { get: { summary: "List public JSON schemas" } },
        "/v1/schemas/{name}": { get: { summary: "Fetch schema by name" } },
        "/v1/compliance/tier-crosswalk": {
          get: { summary: "SINT tier mapping to NIST AI RMF, ISO/IEC 42001, and EU AI Act controls" },
        },
      },
      components: {
        schemas: SINT_SCHEMA_CATALOG,
      },
    });
  });

  return app;
}
