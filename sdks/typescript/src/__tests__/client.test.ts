/**
 * SINT SDK — Client contract tests.
 *
 * These tests intentionally mirror gateway v0.2 route contracts.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  SintClient,
  SintError,
  createSintClient,
  type SintDiscovery,
  type SintHealth,
} from "../index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE_ROOT = resolve(HERE, "../../../../packages/conformance-tests/fixtures");

const VALID_AGENT_ID = "a".repeat(64);
const VALID_TOKEN_ID = "01950000-0000-7000-8000-000000000001";
const UUID_V7_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?Z$/;

function loadJson<T>(relativePath: string): T {
  const fullPath = resolve(FIXTURE_ROOT, relativePath);
  return JSON.parse(readFileSync(fullPath, "utf8")) as T;
}

function mockFetch(status: number, body: unknown): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

const BASE_URL = "http://localhost:3100";
let client: SintClient;

beforeEach(() => {
  client = new SintClient({ baseUrl: BASE_URL, apiKey: "test-key" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SintClient", () => {
  it("discovery() matches well-known v0.2 fixture shape", async () => {
    const payload = loadJson<SintDiscovery>("protocol/well-known-sint.v0.2.example.json");
    mockFetch(200, payload);

    const result = await client.discovery();

    expect(result.name).toBe("SINT Protocol");
    expect(result.version).toBe("0.2.0");
    expect(Array.isArray(result.supportedBridges)).toBe(true);
    expect(Array.isArray(result.deploymentProfiles)).toBe(true);
    expect(result.openapi).toBe("/v1/openapi.json");
  });

  it("health() returns gateway contract fields", async () => {
    const health: SintHealth = {
      status: "ok",
      version: "0.1.0",
      protocol: "SINT Gate",
      tokens: 1,
      ledgerEvents: 10,
      revokedTokens: 0,
    };
    mockFetch(200, health);

    const result = await client.health();
    expect(result.status).toBe("ok");
    expect(result.protocol).toBe("SINT Gate");
    expect(typeof result.ledgerEvents).toBe("number");
  });

  it("intercept() auto-fills requestId/timestamp and uses X-API-Key header", async () => {
    const fixture = loadJson<{
      requests: {
        ros2: {
          resource: string;
          action: string;
          params: Record<string, unknown>;
          physicalContext: Record<string, unknown>;
          recentActions: string[];
        };
      };
    }>("industrial/warehouse-move-equivalence.v1.json");

    const fetchSpy = mockFetch(200, {
      action: "escalate",
      assignedTier: "T2_act",
      assignedRisk: "T2_stateful",
      approvalRequestId: "01950000-0000-7000-8000-000000000099",
    });

    const decision = await client.intercept({
      agentId: VALID_AGENT_ID,
      tokenId: VALID_TOKEN_ID,
      resource: fixture.requests.ros2.resource,
      action: fixture.requests.ros2.action,
      params: fixture.requests.ros2.params,
      physicalContext: fixture.requests.ros2.physicalContext as any,
      recentActions: fixture.requests.ros2.recentActions,
    });

    expect(decision.action).toBe("escalate");
    expect(decision.assignedTier).toBe("T2_act");

    const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    const headers = init.headers as Record<string, string>;

    expect(String(body["resource"])).toBe(fixture.requests.ros2.resource);
    expect(String(body["action"])).toBe(fixture.requests.ros2.action);
    expect(UUID_V7_RE.test(String(body["requestId"]))).toBe(true);
    expect(ISO_UTC_RE.test(String(body["timestamp"]))).toBe(true);
    expect(headers["X-API-Key"]).toBe("test-key");
  });

  it("interceptBatch() sends canonical array payload expected by gateway", async () => {
    const fetchSpy = mockFetch(207, [
      {
        status: 200,
        decision: { action: "allow", assignedTier: "T0_observe", assignedRisk: "T0_read" },
      },
      {
        status: 202,
        decision: { action: "escalate", assignedTier: "T2_act", assignedRisk: "T2_stateful" },
        approvalRequestId: "01950000-0000-7000-8000-000000000111",
      },
    ]);

    const results = await client.interceptBatch([
      {
        agentId: VALID_AGENT_ID,
        tokenId: VALID_TOKEN_ID,
        resource: "ros2:///camera/front",
        action: "subscribe",
      },
      {
        agentId: VALID_AGENT_ID,
        tokenId: VALID_TOKEN_ID,
        resource: "ros2:///cmd_vel",
        action: "publish",
        params: { linear: { x: 0.2 } },
      },
    ]);

    expect(Array.isArray(results)).toBe(true);
    expect(results).toHaveLength(2);
    expect(results[0]?.status).toBe(200);
    expect(results[1]?.status).toBe(202);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/v1/intercept/batch");
    const payload = JSON.parse(String(init.body)) as Array<Record<string, unknown>>;
    expect(Array.isArray(payload)).toBe(true);
    expect(payload).toHaveLength(2);
    expect(UUID_V7_RE.test(String(payload[0]?.["requestId"]))).toBe(true);
    expect(ISO_UTC_RE.test(String(payload[0]?.["timestamp"]))).toBe(true);
  });

  it("pendingApprovals() returns {count, requests} contract", async () => {
    mockFetch(200, {
      count: 1,
      requests: [
        {
          requestId: "01950000-0000-7000-8000-000000000222",
          reason: "T2 escalation",
          requiredTier: "T2_act",
          resource: "ros2:///cmd_vel",
          action: "publish",
          agentId: VALID_AGENT_ID,
          fallbackAction: "deny",
          approvalCount: 0,
          createdAt: "2026-04-04T10:00:00.000000Z",
          expiresAt: "2026-04-04T10:05:00.000000Z",
        },
      ],
    });

    const result = await client.pendingApprovals();
    expect(result.count).toBe(1);
    expect(result.requests[0]?.requiredTier).toBe("T2_act");
  });

  it("resolveApproval() supports 202 pending quorum responses", async () => {
    mockFetch(202, {
      requestId: "01950000-0000-7000-8000-000000000333",
      status: "pending",
      requiredApprovals: 2,
      approvalCount: 1,
    });

    const result = await client.resolveApproval("01950000-0000-7000-8000-000000000333", {
      status: "approved",
      by: "ops-lead",
    });

    expect(result.requestId).toBe("01950000-0000-7000-8000-000000000333");
    if ("status" in result) {
      expect(result.status).toBe("pending");
    }
  });

  it("schemas() and schema(name) map to gateway schema endpoints", async () => {
    const schemaIndexSpy = mockFetch(200, {
      total: 2,
      schemas: [
        { name: "request", path: "/v1/schemas/request" },
        { name: "policy-decision", path: "/v1/schemas/policy-decision" },
      ],
    });

    const schemas = await client.schemas();
    expect(schemas.total).toBe(2);
    expect(schemas.schemas[0]?.name).toBe("request");
    expect((schemaIndexSpy.mock.calls[0]?.[0] as string)).toContain("/v1/schemas");

    vi.restoreAllMocks();
    const singleSchemaSpy = mockFetch(200, { title: "SINT Request", type: "object" });
    const schema = await client.schema("request");
    expect(schema["title"]).toBe("SINT Request");
    expect((singleSchemaSpy.mock.calls[0]?.[0] as string)).toContain("/v1/schemas/request");
  });

  it("throws SintError on 5xx/4xx responses with gateway error body", async () => {
    mockFetch(500, { code: "INTERNAL_ERROR", message: "Database unavailable" });

    await expect(
      client.intercept({
        agentId: VALID_AGENT_ID,
        tokenId: VALID_TOKEN_ID,
        resource: "ros2:///cmd_vel",
        action: "publish",
      }),
    ).rejects.toMatchObject({
      name: "SintError",
      status: 500,
      code: "INTERNAL_ERROR",
      message: "Database unavailable",
    } satisfies Partial<SintError>);
  });

  it("createSintClient() returns a functional SintClient instance", async () => {
    const sint = createSintClient({ baseUrl: BASE_URL });
    expect(sint).toBeInstanceOf(SintClient);

    mockFetch(200, {
      status: "ok",
      version: "0.1.0",
      protocol: "SINT Gate",
      tokens: 0,
      ledgerEvents: 0,
      revokedTokens: 0,
    });

    const health = await sint.health();
    expect(health.status).toBe("ok");
  });
});
