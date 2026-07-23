/**
 * SINT Client SDK — Tests.
 *
 * Tests the SintClient against a real Hono app instance (no network).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { SintClient } from "../src/sint-client.js";
import {
  createApp,
  createContext,
  type ServerContext,
} from "@pshkv/gateway-server";
import type { Hono } from "hono";
import {
  hashSha256,
  sign,
  generateKeypair,
  issueCapabilityToken,
} from "@pshkv/gate-capability-tokens";
import type {
  MissionManifest,
  SintCapabilityTokenRequest,
} from "@pshkv/core";
import {
  computeMissionManifestPolicyPayload,
  computeMissionManifestSigningPayload,
  computeMissionActionOutcomeSigningPayload,
} from "@pshkv/core";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

describe("SintClient", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  let ctx: ServerContext;
  let app: Hono;
  let client: SintClient;

  beforeEach(() => {
    ctx = createContext();
    app = createApp(ctx);

    // Create a client that uses Hono's built-in request() as fetch
    client = new SintClient({
      baseUrl: "http://localhost",
      fetch: (input, init) => app.request(
        typeof input === "string" ? input.replace("http://localhost", "") : input,
        init,
      ),
    });
  });

  async function issueAndStoreToken(overrides?: Partial<SintCapabilityTokenRequest>) {
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

  it("health() returns server status", async () => {
    const result = await client.health();
    expect(result.status).toBe("ok");
    expect(result.protocol).toBe("SINT Gate");
  });

  it("intercept() evaluates a request", async () => {
    const token = await issueAndStoreToken();
    const result = await client.intercept({
      requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
      timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: "ros2:///camera/front",
      action: "subscribe",
      params: {},
    });
    expect(result.action).toBe("allow");
  });

  it("interceptBatch() evaluates multiple requests", async () => {
    const token = await issueAndStoreToken();
    const timestamp = new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
    const results = await client.interceptBatch([
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
    ]);
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe(200);
  });

  it("issueToken() issues a new token", async () => {
    const result = await client.issueToken(
      {
        issuer: root.publicKey,
        subject: agent.publicKey,
        resource: "ros2:///cmd_vel",
        actions: ["publish"],
        constraints: { maxVelocityMps: 0.5 },
        delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
        expiresAt: futureISO(12),
        revocable: true,
      },
      root.privateKey,
    );
    expect(result.tokenId).toBeDefined();
    expect(await ctx.tokenStore.get(result.tokenId)).toBeDefined();
  });

  it("revokeToken() revokes a token", async () => {
    const token = await issueAndStoreToken();
    const result = await client.revokeToken(
      token.tokenId,
      "Security incident",
      "admin",
    );
    expect(result.status).toBe("revoked");
  });

  it("queryLedger() returns events", async () => {
    const token = await issueAndStoreToken();
    await client.intercept({
      requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
      timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: "ros2:///camera/front",
      action: "subscribe",
      params: {},
    });
    const result = await client.queryLedger();
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.chainIntegrity).toBe(true);
  });

  it("manages and evaluates mission authority", async () => {
    const token = await issueAndStoreToken();
    const policy: Omit<MissionManifest, "policyHash" | "signature"> = {
      manifestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6b8",
      protocolVersion: "0.3.0",
      manifestVersion: 1,
      issuer: root.publicKey,
      platformId: "ros2-ground-01",
      platformIdentity: agent.publicKey,
      missionClass: "logistics",
      validFrom: "2026-01-01T00:00:00.000000Z",
      validUntil: "2030-01-01T00:00:00.000000Z",
      resources: ["ros2:///camera/front"],
      actions: ["subscribe"],
      effectConstraints: [],
      approvalPolicy: {
        minimumQuorum: 0,
        authorizedOperatorIds: [],
        authorizationMaxAgeMs: 60_000,
      },
      abortConditions: [
        { conditionId: "estop", signal: "estop", response: "terminate" },
        {
          conditionId: "revoked",
          signal: "authority_revoked",
          response: "return_to_safe_state",
        },
      ],
      maxDelegationDepth: 1,
      delegationDepth: 0,
    };
    const unsignedManifest: Omit<MissionManifest, "signature"> = {
      ...policy,
      policyHash: hashSha256(computeMissionManifestPolicyPayload(policy)),
    };
    const manifest: MissionManifest = {
      ...unsignedManifest,
      signature: sign(
        root.privateKey,
        computeMissionManifestSigningPayload(unsignedManifest),
      ),
    };
    await client.registerMissionManifest(manifest);
    expect((await client.listMissionManifests()).total).toBe(1);

    const requestId = "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7";
    const request = {
      requestId,
      timestamp: new Date().toISOString(),
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: "ros2:///camera/front",
      action: "subscribe",
      params: {},
    };
    const evaluated = await client.evaluateMissionAction({
      manifestId: manifest.manifestId,
      proposal: {
        actionRef: requestId,
        platformId: manifest.platformId,
        platformIdentity: agent.publicKey,
        resource: request.resource,
        action: request.action,
        proposedAt: request.timestamp,
        communicationsAvailable: true,
        autonomyCompromised: false,
        authorityRevoked: false,
        operatorAuthorizations: [],
      },
      request,
    });
    expect(evaluated.executable).toBe(true);

    const unsignedOutcome = {
      actionRef: requestId,
      manifestId: manifest.manifestId,
      platformIdentity: agent.publicKey,
      outcome: "completed" as const,
      completedAt: new Date(Date.now() + 1000).toISOString(),
    };
    const finalized = await client.finalizeMissionAction({
      ...unsignedOutcome,
      signature: sign(
        agent.privateKey,
        computeMissionActionOutcomeSigningPayload(unsignedOutcome),
      ),
    });
    expect(finalized.status).toBe("finalized");
    expect(finalized.gateReceiptEventId).toBe(evaluated.gateReceiptEventId);
    expect((await client.getMissionEvidence(requestId)).chainIntegrity).toBe(true);

    const revocation = await client.revokeMissionManifest(
      manifest.manifestId,
      "Mission cancelled",
      "operator-1",
    );
    expect(revocation.status).toBe("revoked");
  });

  it("generateKeypair() generates Ed25519 keypair", async () => {
    const kp = await client.generateKeypair();
    expect(kp.publicKey).toHaveLength(64);
    expect(kp.privateKey).toBeDefined();
  });

  it("pendingApprovals() lists pending requests", async () => {
    const token = await issueAndStoreToken({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
    });
    await client.intercept({
      requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
      timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: "ros2:///cmd_vel",
      action: "publish",
      params: {},
    });
    const pending = await client.pendingApprovals();
    expect(pending.count).toBe(1);
  });

  it("resolveApproval() approves a pending request", async () => {
    const token = await issueAndStoreToken({
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
    });
    const interceptResult = await client.intercept({
      requestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7",
      timestamp: new Date().toISOString().replace(/\.(\d{3})Z$/, ".$1000Z"),
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: "ros2:///cmd_vel",
      action: "publish",
      params: {},
    });
    const result = await client.resolveApproval(
      interceptResult.approvalRequestId!,
      "approved",
      "operator-1",
    );
    expect(result.resolution.status).toBe("approved");
  });

  it("delegateToken() creates an attenuated token from parent", async () => {
    // Issue a root token with broad permissions
    const rootToken = await issueAndStoreToken({
      resource: "ros2:///camera/front",
      actions: ["subscribe"],
    });

    // Delegate to a sub-agent with the same or narrower scope
    const subAgent = generateKeypair();
    const result = await client.delegateToken(
      rootToken.tokenId,
      {
        newSubject: subAgent.publicKey,
        restrictActions: ["subscribe"],
        expiresAt: futureISO(6),
      },
      agent.privateKey,
    );

    expect(result.tokenId).toBeDefined();
    expect(await ctx.tokenStore.get(result.tokenId)).toBeDefined();
  });

  it("delegateToken() throws on missing parent token", async () => {
    const subAgent = generateKeypair();
    await expect(
      client.delegateToken(
        "nonexistent-token-id",
        {
          newSubject: subAgent.publicKey,
          restrictActions: ["subscribe"],
        },
        agent.privateKey,
      ),
    ).rejects.toThrow("Token delegation failed");
  });

  it("intercept() throws on invalid request", async () => {
    await expect(
      client.intercept({
        requestId: "",
        timestamp: "",
        agentId: "",
        tokenId: "",
        resource: "",
        action: "",
      }),
    ).rejects.toThrow("Intercept failed");
  });
});
