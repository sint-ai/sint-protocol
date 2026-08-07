/**
 * SINT Gateway Server — API end-to-end tests.
 *
 * Tests HTTP endpoints using Hono's built-in test client.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createApp, createContext, type ServerContext } from "../src/server.js";
import type { Hono } from "hono";
import {
  generateKeypair,
  issueCapabilityToken,
} from "@pshkv/gate-capability-tokens";
import type { SintCapabilityTokenRequest } from "@pshkv/core";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

describe("Gateway Server API", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  let ctx: ServerContext;
  let app: Hono;

  beforeEach(() => {
    ctx = createContext();
    app = createApp(ctx);
  });

  async function issueAndStoreToken(
    overrides?: Partial<SintCapabilityTokenRequest>,
  ) {
    const request: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "ros2:///camera/front",
      actions: ["subscribe"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(12),
      revocable: true,
      ...overrides,
    };
    const result = issueCapabilityToken(request, root.privateKey);
    if (!result.ok) throw new Error(`Token issuance failed: ${result.error}`);
    await ctx.tokenStore.store(result.value);
    return result.value;
  }

  // ── Health ──

  it("GET /v1/health returns 200", async () => {
    const res = await app.request("/v1/health");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.protocol).toBe("SINT Gate");
    expect(body.backend.store).toBeDefined();
    expect(body.backend.cache).toBeDefined();
  });

  it("GET /v1/ready returns readiness checks", async () => {
    const res = await app.request("/v1/ready");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ready");
    expect(body.checks.store.ok).toBe(true);
    expect(body.checks.cache.ok).toBe(true);
  });

  it("GET /.well-known/sint.json returns discovery metadata", async () => {
    const res = await app.request("/.well-known/sint.json");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("SINT Protocol");
    expect(body.version).toBeDefined();
    expect(Array.isArray(body.supportedBridges)).toBe(true);
    expect(Array.isArray(body.deploymentProfiles)).toBe(true);
    expect(body.approvalTransports?.sse).toBe("/v1/approvals/events");
    expect(body.approvalTransports?.websocket).toBe("/v1/approvals/ws");
    expect(body.complianceCrosswalk?.path).toBe("/v1/compliance/tier-crosswalk");
  });

  it("GET /v1/schemas returns schema catalog", async () => {
    const res = await app.request("/v1/schemas");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBeGreaterThan(0);
    expect(Array.isArray(body.schemas)).toBe(true);
  });

  it("GET /v1/openapi.json returns OpenAPI document", async () => {
    const res = await app.request("/v1/openapi.json");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.openapi).toBe("3.1.0");
    expect(body.paths["/.well-known/sint.json"]).toBeDefined();
    expect(body.paths["/v1/approvals/events"]).toBeDefined();
    expect(body.paths["/v1/approvals/ws"]).toBeDefined();
    expect(body.paths["/v1/compliance/tier-crosswalk"]).toBeDefined();
    expect(body.paths["/v1/docs"]).toBeDefined();
    expect(body.paths["/v1/docs/redoc"]).toBeDefined();
  });

  it("GET /v1/docs returns HTML docs landing page", async () => {
    const res = await app.request("/v1/docs");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("SINT Gateway API Documentation");
    expect(body).toContain("/v1/openapi.json");
  });

  it("GET /v1/docs/redoc returns Redoc UI shell", async () => {
    const res = await app.request("/v1/docs/redoc");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const body = await res.text();
    expect(body).toContain("redoc");
    expect(body).toContain("/v1/openapi.json");
  });

  it("GET /v1/compliance/tier-crosswalk returns tier mappings", async () => {
    const res = await app.request("/v1/compliance/tier-crosswalk");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.mappings)).toBe(true);
    expect(body.mappings.length).toBe(4);
    expect(body.mappings[0].mappings.length).toBeGreaterThanOrEqual(3);
  });

  // ── Intercept ──

  it("POST /v1/simulation/preflight returns a non-authorizing exact effect plan", async () => {
    const token = await issueAndStoreToken({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
    });
    const request = {
      requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
      timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: "ros2:///cmd_vel",
      action: "publish",
      params: { linear: { x: 0.2 } },
    };

    const res = await app.request("/v1/simulation/preflight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.authorizesExecution).toBe(false);
    expect(body.assignedTier).toBe("T2_act");
    expect(body.effectPlan.resource).toBe(request.resource);
    expect(body.effectPlan.params).toEqual(request.params);
  });

  it("POST /v1/intercept with valid request", async () => {
    const token = await issueAndStoreToken();

    const res = await app.request("/v1/intercept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
        timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///camera/front",
        action: "subscribe",
        params: {},
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.action).toBe("allow");
  });

  it("POST /v1/intercept with invalid request returns 400", async () => {
    const res = await app.request("/v1/intercept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invalid: true }),
    });

    expect(res.status).toBe(400);
  });

  // ── Batch Intercept ──

  it("POST /v1/intercept/batch returns 207", async () => {
    const token = await issueAndStoreToken();
    const timestamp = new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");

    const res = await app.request("/v1/intercept/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([
        {
          requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
          timestamp,
          agentId: agent.publicKey,
          tokenId: token.tokenId,
          resource: "ros2:///camera/front",
          action: "subscribe",
          params: {},
        },
        {
          requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a8",
          timestamp,
          agentId: agent.publicKey,
          tokenId: token.tokenId,
          resource: "ros2:///camera/front",
          action: "subscribe",
          params: {},
        },
      ]),
    });

    expect(res.status).toBe(207);
    const body = await res.json();
    expect(body).toHaveLength(2);
    expect(body[0].status).toBe(200);
  });

  it("POST /v1/intercept/batch rejects non-array", async () => {
    const res = await app.request("/v1/intercept/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ not: "array" }),
    });

    expect(res.status).toBe(400);
  });

  // ── Tokens ──

  it("POST /v1/tokens issues a new token", async () => {
    const res = await app.request("/v1/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request: {
          issuer: root.publicKey,
          subject: agent.publicKey,
          resource: "ros2:///cmd_vel",
          actions: ["publish"],
          constraints: { maxVelocityMps: 0.5 },
          delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
          expiresAt: futureISO(12),
          revocable: true,
        },
        privateKey: root.privateKey,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.tokenId).toBeDefined();
    expect(await ctx.tokenStore.get(body.tokenId)).toBeDefined();
  });

  // ── Token Revocation ──

  it("POST /v1/tokens/revoke revokes a token", async () => {
    const token = await issueAndStoreToken();

    const res = await app.request("/v1/tokens/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokenId: token.tokenId,
        reason: "Security incident",
        revokedBy: "admin",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("revoked");
  });

  it("POST /v1/tokens/revoke rejects missing fields", async () => {
    const res = await app.request("/v1/tokens/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tokenId: "abc" }),
    });

    expect(res.status).toBe(400);
  });

  // ── Ledger ──

  it("GET /v1/ledger returns events", async () => {
    const token = await issueAndStoreToken();

    // Generate some ledger events via intercept
    await app.request("/v1/intercept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
        timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
        agentId: agent.publicKey,
        tokenId: token.tokenId,
        resource: "ros2:///camera/front",
        action: "subscribe",
        params: {},
      }),
    });

    const res = await app.request("/v1/ledger");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.events.length).toBeGreaterThan(0);
    expect(body.chainIntegrity).toBe(true);
  });

  // ── Keypair ──

  it("POST /v1/keypair generates a keypair", async () => {
    const res = await app.request("/v1/keypair", { method: "POST" });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.publicKey).toBeDefined();
    expect(body.privateKey).toBeDefined();
    expect(body.publicKey).toHaveLength(64);
  });

  // ── Approvals ──

  function issueT2Token() {
    return issueAndStoreToken({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
    });
  }

  function issueT2QuorumToken() {
    return issueAndStoreToken({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      constraints: {
        quorum: {
          required: 2,
          authorized: ["op-alice", "op-bob", "op-carol"],
        },
      },
    });
  }

  function issueJointCommandToken() {
    return issueAndStoreToken({
      resource: "ros2:///joint_commands",
      actions: ["publish"],
      constraints: {
        maxVelocityMps: 0.5,
        maxForceNewtons: 100,
      },
    });
  }

  function makeT2Request(tokenId: string) {
    return {
      requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
      timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
      agentId: agent.publicKey,
      tokenId,
      resource: "ros2:///cmd_vel",
      action: "publish",
      params: {},
    };
  }

  function makeFactoryActionRequest(tokenId: string) {
    return {
      requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6b1",
      timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
      agentId: agent.publicKey,
      tokenId,
      resource: "ros2:///joint_commands",
      action: "publish",
      params: {
        action_type: "robot.motion.pick_and_place",
        target_robot: "robot_abb_irb_1200_01",
        source_pose: "inspection_conveyor_exit",
        target_pose: "pallet_station_A",
        max_velocity_mps: 0.25,
        max_force_newtons: 80,
        tool_type: "vacuum_gripper",
        payload_kg: 2.4,
        requires_simulation_receipt: true,
        requires_human_approval: true,
        requires_safety_zone_clear: true,
        cell_id: "packaging_cell_001",
        simulation_receipt_id: "simr_packaging_001",
      },
      physicalContext: {
        currentVelocityMps: 0.25,
        currentForceNewtons: 80,
      },
      executionContext: {
        bridgeProtocol: "ros2",
        siteId: "packaging_lab_001",
        factoryReceiptChain: [
          {
            step: "factory_intent_compiled",
            eventType: "factory.intent.compiled",
            digest: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
            previousDigest: null,
          },
          {
            step: "cell_graph_planned",
            eventType: "factory.cell_graph.planned",
            digest: "sha256:5555555555555555555555555555555555555555555555555555555555555555",
            previousDigest: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
          },
          {
            step: "simulation_receipt_verified",
            eventType: "factory.simulation.verified",
            digest: "sha256:6666666666666666666666666666666666666666666666666666666666666666",
            previousDigest: "sha256:5555555555555555555555555555555555555555555555555555555555555555",
          },
          {
            step: "human_approval_granted",
            eventType: "factory.approval.granted",
            digest: "sha256:7777777777777777777777777777777777777777777777777777777777777777",
            previousDigest: "sha256:6666666666666666666666666666666666666666666666666666666666666666",
          },
          {
            step: "execution_receipt_emitted",
            eventType: "factory.execution.receipt",
            digest: "sha256:8888888888888888888888888888888888888888888888888888888888888888",
            previousDigest: "sha256:7777777777777777777777777777777777777777777777777777777777777777",
          },
        ],
      },
    };
  }

  it("POST /v1/intercept escalated request returns approvalRequestId", async () => {
    const token = await issueT2Token();
    const res = await app.request("/v1/intercept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeT2Request(token.tokenId)),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.action).toBe("escalate");
    expect(body.approvalRequestId).toBeDefined();
  });

  it("GET /v1/approvals/pending lists queued requests", async () => {
    const token = await issueT2Token();
    await app.request("/v1/intercept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeT2Request(token.tokenId)),
    });

    const res = await app.request("/v1/approvals/pending");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.requests[0].resource).toBe("ros2:///cmd_vel");
    expect(body.requests[0].action).toBe("publish");
  });

  it("GET /v1/approvals/pending includes factory-action evidence context", async () => {
    const token = await issueJointCommandToken();
    await app.request("/v1/intercept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeFactoryActionRequest(token.tokenId)),
    });

    const res = await app.request("/v1/approvals/pending");
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.count).toBe(1);
    expect(body.requests[0].resource).toBe("ros2:///joint_commands");
    expect(body.requests[0].params.action_type).toBe("robot.motion.pick_and_place");
    expect(body.requests[0].params.simulation_receipt_id).toBe("simr_packaging_001");
    expect(body.requests[0].physicalContext.currentVelocityMps).toBe(0.25);
    expect(body.requests[0].physicalContext.currentForceNewtons).toBe(80);
    expect(body.requests[0].executionContext.siteId).toBe("packaging_lab_001");
    expect(body.requests[0].executionContext.factoryReceiptChain).toHaveLength(5);
    expect(body.requests[0].executionContext.factoryReceiptChain[0].eventType).toBe(
      "factory.intent.compiled",
    );
    expect(body.requests[0].executionContext.factoryReceiptChain[4].eventType).toBe(
      "factory.execution.receipt",
    );
  });

  it("GET /v1/approvals/:requestId returns request details", async () => {
    const token = await issueT2Token();
    const interceptRes = await app.request("/v1/intercept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeT2Request(token.tokenId)),
    });
    const { approvalRequestId } = await interceptRes.json();

    const res = await app.request(`/v1/approvals/${approvalRequestId}`);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.requestId).toBe(approvalRequestId);
    expect(body.resource).toBe("ros2:///cmd_vel");
    expect(body.agentId).toBe(agent.publicKey);
  });

  it("GET /v1/approvals/:requestId returns 404 for unknown ID", async () => {
    const res = await app.request("/v1/approvals/nonexistent-id");
    expect(res.status).toBe(404);
  });

  it("POST /v1/approvals/:requestId/resolve approves a request", async () => {
    const token = await issueT2Token();
    const interceptRes = await app.request("/v1/intercept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeT2Request(token.tokenId)),
    });
    const { approvalRequestId } = await interceptRes.json();

    const res = await app.request(`/v1/approvals/${approvalRequestId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved", by: "operator-1" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resolution.status).toBe("approved");
    expect(body.resolution.by).toBe("operator-1");
  });

  it("POST /v1/approvals/:requestId/resolve fail-closes revoked token approvals", async () => {
    const token = await issueT2Token();
    const interceptRes = await app.request("/v1/intercept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeT2Request(token.tokenId)),
    });
    const { approvalRequestId } = await interceptRes.json();

    await app.request("/v1/tokens/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tokenId: token.tokenId,
        reason: "security incident",
        revokedBy: "ops",
      }),
    });

    const res = await app.request(`/v1/approvals/${approvalRequestId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved", by: "operator-1" }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("Stale approval request");
  });

  it("quorum approval returns pending until threshold is reached", async () => {
    const token = await issueT2QuorumToken();
    const interceptRes = await app.request("/v1/intercept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeT2Request(token.tokenId)),
    });
    const { approvalRequestId } = await interceptRes.json();

    const firstVote = await app.request(`/v1/approvals/${approvalRequestId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved", by: "op-alice" }),
    });

    expect(firstVote.status).toBe(202);
    const firstBody = await firstVote.json();
    expect(firstBody.status).toBe("pending");
    expect(firstBody.requiredApprovals).toBe(2);
    expect(firstBody.approvalCount).toBe(1);

    const secondVote = await app.request(`/v1/approvals/${approvalRequestId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved", by: "op-bob" }),
    });
    expect(secondVote.status).toBe(200);
    const secondBody = await secondVote.json();
    expect(secondBody.resolution.status).toBe("approved");
    expect(secondBody.resolution.approvers).toEqual(["op-alice", "op-bob"]);
  });

  it("POST /v1/approvals/:requestId/resolve denies a request", async () => {
    const token = await issueT2Token();
    const interceptRes = await app.request("/v1/intercept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeT2Request(token.tokenId)),
    });
    const { approvalRequestId } = await interceptRes.json();

    const res = await app.request(`/v1/approvals/${approvalRequestId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "denied", by: "operator-1", reason: "Too risky" }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.resolution.status).toBe("denied");
  });

  it("POST /v1/approvals/:requestId/resolve rejects missing status", async () => {
    const res = await app.request("/v1/approvals/some-id/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ by: "operator-1" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /v1/approvals/:requestId/resolve rejects missing by", async () => {
    const res = await app.request("/v1/approvals/some-id/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved" }),
    });
    expect(res.status).toBe(400);
  });

  it("resolve creates ledger event", async () => {
    const token = await issueT2Token();
    const interceptRes = await app.request("/v1/intercept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makeT2Request(token.tokenId)),
    });
    const { approvalRequestId } = await interceptRes.json();

    await app.request(`/v1/approvals/${approvalRequestId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "approved", by: "operator-1" }),
    });

    const ledgerRes = await app.request("/v1/ledger");
    const ledger = await ledgerRes.json();
    const approvalEvent = ledger.events.find(
      (e: any) => e.eventType === "approval.granted",
    );
    expect(approvalEvent).toBeDefined();
    expect(approvalEvent.payload.requestId).toBe(approvalRequestId);
  });

  // ── Request ID header ──

  it("responses include x-request-id header", async () => {
    const res = await app.request("/v1/health");
    expect(res.headers.get("x-request-id")).toBeDefined();
  });
});
