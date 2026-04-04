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
} from "@sint/core";

export function discoveryRoutes(): Hono {
  const app = new Hono();

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
        "/v1/approvals/{requestId}/resolve": { post: { summary: "Resolve approval" } },
        "/v1/a2a": { post: { summary: "A2A JSON-RPC endpoint" } },
        "/v1/a2a/agents": { get: { summary: "List A2A agents" }, post: { summary: "Register A2A agent" } },
        "/v1/schemas": { get: { summary: "List public JSON schemas" } },
        "/v1/schemas/{name}": { get: { summary: "Fetch schema by name" } },
      },
      components: {
        schemas: SINT_SCHEMA_CATALOG,
      },
    });
  });

  return app;
}
