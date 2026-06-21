import { beforeEach, describe, expect, it } from "vitest";
import type { Hono } from "hono";
import type {
  MissionActionProposal,
  MissionManifest,
  SintCapabilityTokenRequest,
} from "@pshkv/core";
import {
  hashSha256,
  sign,
  generateKeypair,
  issueCapabilityToken,
} from "@pshkv/gate-capability-tokens";
import {
  computeMissionManifestPolicyPayload,
  computeMissionManifestSigningPayload,
  computeMissionActionOutcomeSigningPayload,
} from "@pshkv/core";
import { createApp, createContext, type ServerContext } from "../src/server.js";

const MANIFEST_ID = "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6a7";
const REQUEST_ID = "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6b8";
const CHILD_MANIFEST_ID = "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6c9";
const SECOND_REQUEST_ID = "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6d1";

describe("Mission Authority API", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  let ctx: ServerContext;
  let app: Hono;

  beforeEach(() => {
    ctx = createContext();
    app = createApp(ctx);
  });

  function manifest(
    overrides: Partial<Omit<MissionManifest, "policyHash" | "signature">> = {},
    signingPrivateKey = root.privateKey,
  ): MissionManifest {
    const policy: Omit<MissionManifest, "policyHash" | "signature"> = {
      manifestId: MANIFEST_ID,
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
      ...overrides,
    };
    const unsigned: Omit<MissionManifest, "signature"> = {
      ...policy,
      policyHash: hashSha256(computeMissionManifestPolicyPayload(policy)),
    };
    return {
      ...unsigned,
      signature: sign(signingPrivateKey, computeMissionManifestSigningPayload(unsigned)),
    };
  }

  function proposal(
    overrides: Partial<MissionActionProposal> = {},
  ): MissionActionProposal {
    return {
      actionRef: REQUEST_ID,
      platformId: "ros2-ground-01",
      platformIdentity: agent.publicKey,
      resource: "ros2:///camera/front",
      action: "subscribe",
      proposedAt: new Date().toISOString(),
      communicationsAvailable: true,
      autonomyCompromised: false,
      authorityRevoked: false,
      operatorAuthorizations: [],
      ...overrides,
    };
  }

  async function requestAndToken(requestId = REQUEST_ID) {
    const tokenRequest: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "ros2:///camera/front",
      actions: ["subscribe"],
      constraints: {},
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: "2030-01-01T00:00:00.000000Z",
      revocable: true,
    };
    const issued = issueCapabilityToken(tokenRequest, root.privateKey);
    if (!issued.ok) throw new Error(issued.error);
    await ctx.tokenStore.store(issued.value);
    return {
      requestId,
      timestamp: new Date().toISOString(),
      agentId: agent.publicKey,
      tokenId: issued.value.tokenId,
      resource: "ros2:///camera/front",
      action: "subscribe",
      params: {},
    };
  }

  it("registers, lists, and retrieves immutable manifests", async () => {
    const registered = await app.request("/v1/mission-authority/manifests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(manifest()),
    });
    expect(registered.status).toBe(201);

    const duplicate = await app.request("/v1/mission-authority/manifests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(manifest()),
    });
    expect(duplicate.status).toBe(409);

    const listed = await app.request(
      "/v1/mission-authority/manifests?platformId=ros2-ground-01",
    );
    expect(listed.status).toBe(200);
    expect((await listed.json()).total).toBe(1);

    const retrieved = await app.request(
      `/v1/mission-authority/manifests/${MANIFEST_ID}`,
    );
    expect(retrieved.status).toBe(200);
    expect((await retrieved.json()).manifest.manifestId).toBe(MANIFEST_ID);
  });

  it("rejects a manifest not signed by its declared issuer", async () => {
    const forged = { ...manifest(), signature: "d".repeat(128) };
    const response = await app.request("/v1/mission-authority/manifests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(forged),
    });
    expect(response.status).toBe(401);
  });

  it("rejects a signed manifest whose policy hash is false", async () => {
    const valid = manifest();
    const unsigned = { ...valid, policyHash: "e".repeat(64) };
    const mismatched = {
      ...unsigned,
      signature: sign(
        root.privateKey,
        computeMissionManifestSigningPayload(unsigned),
      ),
    };
    const response = await app.request("/v1/mission-authority/manifests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mismatched),
    });
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain("policy hash mismatch");
  });

  it("accepts attenuation-only delegation and rejects expanded authority", async () => {
    const parent = manifest();
    await ctx.missionManifestStore.store(parent);

    const child = manifest({
      manifestId: CHILD_MANIFEST_ID,
      manifestVersion: 2,
      parentManifestId: MANIFEST_ID,
      delegationDepth: 1,
      validFrom: "2027-01-01T00:00:00.000000Z",
      validUntil: "2029-01-01T00:00:00.000000Z",
      maxDelegationDepth: 1,
    });
    const accepted = await app.request("/v1/mission-authority/manifests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(child),
    });
    expect(accepted.status).toBe(201);

    const expanded = manifest({
      manifestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6d0",
      manifestVersion: 2,
      parentManifestId: MANIFEST_ID,
      delegationDepth: 1,
      resources: ["ros2:///camera/front", "ros2:///cmd_vel"],
    });
    const rejected = await app.request("/v1/mission-authority/manifests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(expanded),
    });
    expect(rejected.status).toBe(422);
    expect((await rejected.json()).violations).toContain(
      "RESOURCE_SCOPE_EXPANDED",
    );
  });

  it("rejects delegated authority signed by an unrelated issuer", async () => {
    await ctx.missionManifestStore.store(manifest());
    const foreignIssuer = generateKeypair();
    const child = manifest({
      manifestId: CHILD_MANIFEST_ID,
      manifestVersion: 2,
      issuer: foreignIssuer.publicKey,
      parentManifestId: MANIFEST_ID,
      delegationDepth: 1,
    }, foreignIssuer.privateKey);

    const response = await app.request("/v1/mission-authority/manifests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(child),
    });
    expect(response.status).toBe(422);
    expect((await response.json()).violations).toContain("ISSUER_CHANGED");
  });

  it("rejects delegation from missing or revoked parents", async () => {
    const child = manifest({
      manifestId: CHILD_MANIFEST_ID,
      manifestVersion: 2,
      parentManifestId: MANIFEST_ID,
      delegationDepth: 1,
    });
    const missing = await app.request("/v1/mission-authority/manifests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(child),
    });
    expect(missing.status).toBe(404);

    await ctx.missionManifestStore.store(manifest());
    await ctx.missionManifestStore.revoke({
      manifestId: MANIFEST_ID,
      reason: "Cancelled",
      revokedBy: "operator-1",
      revokedAt: new Date().toISOString(),
    });
    const revoked = await app.request("/v1/mission-authority/manifests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(child),
    });
    expect(revoked.status).toBe(409);
  });

  it("requires both mission authority and PolicyGateway approval", async () => {
    await ctx.missionManifestStore.store(manifest());
    const request = await requestAndToken();
    const evaluated = await app.request("/v1/mission-authority/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        manifestId: MANIFEST_ID,
        proposal: proposal(),
        request,
      }),
    });
    expect(evaluated.status).toBe(200);
    const body = await evaluated.json();
    expect(body.authorityDecision.action).toBe("allow");
    expect(body.policyDecision.action).toBe("allow");
    expect(body.executable).toBe(true);

    const evidence = await app.request(
      `/v1/mission-authority/actions/${REQUEST_ID}/evidence`,
    );
    expect(evidence.status).toBe(200);
    const evidenceBody = await evidence.json();
    expect(evidenceBody.events).toHaveLength(1);
    expect(evidenceBody.chainIntegrity).toBe(true);
  });

  it("rejects rollback, forks, and execution under a superseded manifest", async () => {
    const registered = await app.request("/v1/mission-authority/manifests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(manifest()),
    });
    expect(registered.status).toBe(201);

    const rollback = await app.request("/v1/mission-authority/manifests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(manifest({
        manifestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6d0",
      })),
    });
    expect(rollback.status).toBe(409);
    expect((await rollback.json()).error).toContain("does not advance");

    const fork = await app.request("/v1/mission-authority/manifests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(manifest({
        manifestId: "01905f7c-4e8a-7b3d-9a1e-f2c3d4e5f6d1",
        manifestVersion: 2,
      })),
    });
    expect(fork.status).toBe(409);
    expect((await fork.json()).error).toContain("directly descend");

    const child = manifest({
      manifestId: CHILD_MANIFEST_ID,
      manifestVersion: 2,
      parentManifestId: MANIFEST_ID,
      delegationDepth: 1,
    });
    const advanced = await app.request("/v1/mission-authority/manifests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(child),
    });
    expect(advanced.status).toBe(201);

    const evaluated = await app.request("/v1/mission-authority/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        manifestId: MANIFEST_ID,
        proposal: proposal(),
        request: await requestAndToken(),
      }),
    });
    const body = await evaluated.json();
    expect(body.executable).toBe(false);
    expect(body.authorityDecision.reasonCode).toBe("MANIFEST_SUPERSEDED");
    expect(body.authorityHead).toEqual({
      manifestId: CHILD_MANIFEST_ID,
      manifestVersion: 2,
    });
  });

  it("denies execution after append-only manifest revocation", async () => {
    await ctx.missionManifestStore.store(manifest());
    const revoked = await app.request(
      `/v1/mission-authority/manifests/${MANIFEST_ID}/revoke`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Mission cancelled", revokedBy: "operator-1" }),
      },
    );
    expect(revoked.status).toBe(200);

    const evaluated = await app.request("/v1/mission-authority/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        manifestId: MANIFEST_ID,
        proposal: proposal(),
        request: await requestAndToken(),
      }),
    });
    const body = await evaluated.json();
    expect(body.authorityDecision.reasonCode).toBe("AUTHORITY_REVOKED");
    expect(body.executable).toBe(false);
  });

  it("fails closed for a child after any ancestor authority is revoked", async () => {
    const parent = manifest();
    const child = manifest({
      manifestId: CHILD_MANIFEST_ID,
      manifestVersion: 2,
      parentManifestId: MANIFEST_ID,
      delegationDepth: 1,
    });
    await ctx.missionManifestStore.store(parent);
    await ctx.missionManifestStore.store(child);
    await ctx.missionManifestStore.revoke({
      manifestId: MANIFEST_ID,
      reason: "Root authority withdrawn",
      revokedBy: "operator-1",
      revokedAt: new Date().toISOString(),
    });

    const evaluated = await app.request("/v1/mission-authority/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        manifestId: CHILD_MANIFEST_ID,
        proposal: proposal(),
        request: await requestAndToken(),
      }),
    });
    expect(evaluated.status).toBe(200);
    const body = await evaluated.json();
    expect(body.authorityDecision.reasonCode).toBe("AUTHORITY_REVOKED");
    expect(body.executable).toBe(false);
    expect(body.authorityChain.revokedManifestId).toBe(MANIFEST_ID);
  });

  it("allows an action reference to be claimed for execution only once", async () => {
    await ctx.missionManifestStore.store(manifest());
    const request = await requestAndToken();
    const input = {
      manifestId: MANIFEST_ID,
      proposal: proposal(),
      request,
    };

    const first = await app.request("/v1/mission-authority/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    expect((await first.json()).executable).toBe(true);

    const replay = await app.request("/v1/mission-authority/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const replayBody = await replay.json();
    expect(replayBody.executable).toBe(false);
    expect(replayBody.authorityDecision.reasonCode).toBe("ACTION_REPLAY_DETECTED");
    expect(replayBody.executionClaim.status).toBe("duplicate");
  });

  it("derives effect use from atomic server claims instead of caller input", async () => {
    const effectManifest = manifest({
      resources: ["ros2:///payload/release"],
      actions: ["execute"],
      effectConstraints: [{
        effectId: "release-1",
        effectType: "non_kinetic",
        resource: "ros2:///payload/release",
        actions: ["execute"],
        maxUses: 1,
        operatorAuthorizationRequired: false,
        minimumApprovalQuorum: 0,
      }],
    });
    await ctx.missionManifestStore.store(effectManifest);

    async function evaluate(requestId: string) {
      const request = await requestAndToken(requestId);
      const effectRequest = {
        ...request,
        resource: "ros2:///payload/release",
        action: "execute",
      };
      const tokenRequest: SintCapabilityTokenRequest = {
        issuer: root.publicKey,
        subject: agent.publicKey,
        resource: effectRequest.resource,
        actions: [effectRequest.action],
        constraints: {},
        delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
        expiresAt: "2030-01-01T00:00:00.000000Z",
        revocable: true,
      };
      const issued = issueCapabilityToken(tokenRequest, root.privateKey);
      if (!issued.ok) throw new Error(issued.error);
      await ctx.tokenStore.store(issued.value);
      effectRequest.tokenId = issued.value.tokenId;

      return app.request("/v1/mission-authority/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manifestId: MANIFEST_ID,
          proposal: proposal({
            actionRef: requestId,
            resource: effectRequest.resource,
            action: effectRequest.action,
            effectId: "release-1",
          }),
          request: effectRequest,
        }),
      });
    }

    expect((await (await evaluate(REQUEST_ID)).json()).executable).toBe(true);
    const second = await (await evaluate(SECOND_REQUEST_ID)).json();
    expect(second.executable).toBe(false);
    expect(second.authorityDecision.reasonCode).toBe("EFFECT_USE_LIMIT_EXCEEDED");
    expect(second.executionClaim.status).toBe("effect_limit_exceeded");
  });

  it("accepts one platform-signed outcome and links it to the gate receipt", async () => {
    await ctx.missionManifestStore.store(manifest());
    const evaluated = await app.request("/v1/mission-authority/evaluate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        manifestId: MANIFEST_ID,
        proposal: proposal(),
        request: await requestAndToken(),
      }),
    });
    const gate = await evaluated.json();
    expect(gate.executable).toBe(true);

    const unsigned = {
      actionRef: REQUEST_ID,
      manifestId: MANIFEST_ID,
      platformIdentity: agent.publicKey,
      outcome: "completed" as const,
      completedAt: new Date(Date.now() + 1000).toISOString(),
    };
    const report = {
      ...unsigned,
      signature: sign(
        agent.privateKey,
        computeMissionActionOutcomeSigningPayload(unsigned),
      ),
    };
    const finalized = await app.request(
      `/v1/mission-authority/actions/${REQUEST_ID}/outcome`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
      },
    );
    expect(finalized.status).toBe(201);
    const body = await finalized.json();
    expect(body.gateReceiptEventId).toBe(gate.gateReceiptEventId);
    expect(body.completionReceiptEventId).toBeDefined();

    const duplicate = await app.request(
      `/v1/mission-authority/actions/${REQUEST_ID}/outcome`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(report),
      },
    );
    expect(duplicate.status).toBe(409);

    const evidence = await app.request(
      `/v1/mission-authority/actions/${REQUEST_ID}/evidence`,
    );
    const evidenceBody = await evidence.json();
    expect(evidenceBody.events).toHaveLength(2);
    expect(evidenceBody.events[1].eventType).toBe("action.completed");
    expect(evidenceBody.events[1].payload.gateReceiptEventId).toBe(
      gate.gateReceiptEventId,
    );
  });

  it("rejects forged outcomes and outcomes without an execution claim", async () => {
    await ctx.missionManifestStore.store(manifest());
    const unsigned = {
      actionRef: REQUEST_ID,
      manifestId: MANIFEST_ID,
      platformIdentity: agent.publicKey,
      outcome: "failed" as const,
      completedAt: new Date().toISOString(),
    };
    const forged = {
      ...unsigned,
      signature: sign(
        root.privateKey,
        computeMissionActionOutcomeSigningPayload(unsigned),
      ),
    };
    const forgedResponse = await app.request(
      `/v1/mission-authority/actions/${REQUEST_ID}/outcome`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(forged),
      },
    );
    expect(forgedResponse.status).toBe(401);

    const valid = {
      ...unsigned,
      signature: sign(
        agent.privateKey,
        computeMissionActionOutcomeSigningPayload(unsigned),
      ),
    };
    const missing = await app.request(
      `/v1/mission-authority/actions/${REQUEST_ID}/outcome`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valid),
      },
    );
    expect(missing.status).toBe(409);
  });
});
