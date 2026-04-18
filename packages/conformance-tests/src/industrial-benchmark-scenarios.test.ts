/**
 * Industrial benchmark scenarios aligned with v0.2 adoption goals.
 */

import { describe, expect, it, beforeEach } from "vitest";
import type { SintCapabilityToken, SintCapabilityTokenRequest } from "@sint-ai/core";
import { ApprovalTier } from "@sint-ai/core";
import {
  generateKeypair,
  generateUUIDv7,
  issueCapabilityToken,
  nowISO8601,
  RevocationStore,
} from "@sint-ai/gate-capability-tokens";
import { PolicyGateway, type EdgeControlPlanePlugin } from "@sint-ai/gate-policy-gateway";
import { rmfDispatchResourceUri, rmfOperationToAction } from "@sint-ai/bridge-open-rmf";

function futureISO(hoursFromNow: number): string {
  const d = new Date(Date.now() + hoursFromNow * 3_600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

function pastISO(hoursAgo: number): string {
  const d = new Date(Date.now() - hoursAgo * 3_600_000);
  return d.toISOString().replace(/\.(\d{3})Z$/, ".$1000Z");
}

describe("Industrial Benchmark Scenarios", () => {
  const root = generateKeypair();
  const agent = generateKeypair();
  const revocationStore = new RevocationStore();

  let tokenStore: Map<string, SintCapabilityToken>;
  let gateway: PolicyGateway;

  function issueAndStore(overrides?: Partial<SintCapabilityTokenRequest>): SintCapabilityToken {
    const req: SintCapabilityTokenRequest = {
      issuer: root.publicKey,
      subject: agent.publicKey,
      resource: "ros2:///cmd_vel",
      actions: ["publish"],
      constraints: { maxVelocityMps: 0.6 },
      delegationChain: { parentTokenId: null, depth: 0, attenuated: false },
      expiresAt: futureISO(4),
      revocable: true,
      ...overrides,
    };
    const result = issueCapabilityToken(req, root.privateKey);
    if (!result.ok) {
      throw new Error(`Token issuance failed: ${result.error}`);
    }
    tokenStore.set(result.value.tokenId, result.value);
    return result.value;
  }

  beforeEach(() => {
    tokenStore = new Map();
    revocationStore.clear();
    gateway = new PolicyGateway({
      resolveToken: (tokenId) => tokenStore.get(tokenId),
      revocationStore,
    });
  });

  it("human enters aisle: cmd_vel request escalates to T3", async () => {
    const token = issueAndStore();

    const decision = await gateway.intercept({
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: "ros2:///cmd_vel",
      action: "publish",
      params: { linear: { x: 0.2 } },
      physicalContext: {
        currentVelocityMps: 0.2,
        humanDetected: true,
      },
    });

    expect(decision.assignedTier).toBe(ApprovalTier.T3_COMMIT);
    expect(decision.action).toBe("escalate");
  });

  it("stale corridor request is deterministically denied", async () => {
    const token = issueAndStore({
      executionEnvelope: {
        corridorId: "corridor-a17",
        expiresAt: futureISO(2),
      },
    });

    const decision = await gateway.intercept({
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: "ros2:///cmd_vel",
      action: "publish",
      params: { linear: { x: 0.2 } },
      executionContext: {
        preapprovedCorridor: {
          corridorId: "corridor-a17",
          expiresAt: pastISO(1),
        },
      },
    });

    expect(decision.action).toBe("deny");
    expect(decision.denial?.reason).toContain("expired");
  });

  it("revocation under load never fails open", async () => {
    const token = issueAndStore();

    const warmup = await Promise.all(
      Array.from({ length: 8 }).map(() =>
        gateway.intercept({
          requestId: generateUUIDv7(),
          timestamp: nowISO8601(),
          agentId: agent.publicKey,
          tokenId: token.tokenId,
          resource: "ros2:///cmd_vel",
          action: "publish",
          params: { linear: { x: 0.1 } },
          physicalContext: { currentVelocityMps: 0.1 },
        }),
      ),
    );
    expect(warmup.some((d) => d.action !== "deny")).toBe(true);

    revocationStore.revoke(token.tokenId, "operator revocation", "safety-supervisor");

    const after = await Promise.all(
      Array.from({ length: 20 }).map(() =>
        gateway.intercept({
          requestId: generateUUIDv7(),
          timestamp: nowISO8601(),
          agentId: agent.publicKey,
          tokenId: token.tokenId,
          resource: "ros2:///cmd_vel",
          action: "publish",
          params: { linear: { x: 0.1 } },
          physicalContext: { currentVelocityMps: 0.1 },
        }),
      ),
    );

    expect(after.every((d) => d.action === "deny")).toBe(true);
    expect(after.every((d) => d.denial?.policyViolated === "TOKEN_REVOKED")).toBe(true);
  });

  it("safety-zone breach is deterministically denied", async () => {
    const token = issueAndStore({
      constraints: {
        geofence: {
          coordinates: [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ],
        },
      },
    });

    const decision = await gateway.intercept({
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: "ros2:///cmd_vel",
      action: "publish",
      params: { linear: { x: 0.1 } },
      physicalContext: {
        currentVelocityMps: 0.1,
        currentPosition: { x: 8, y: 8, z: 0 },
      },
    });

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("CONSTRAINT_VIOLATION");
    expect(decision.denial?.reason).toContain("CONSTRAINT_VIOLATION");
  });

  it("model swap against token modelConstraints is denied", async () => {
    const token = issueAndStore({
      modelConstraints: {
        allowedModelIds: ["gpt-5.4-robotics-safe"],
      },
    });

    const decision = await gateway.intercept({
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: "ros2:///cmd_vel",
      action: "publish",
      params: { linear: { x: 0.1 } },
      executionContext: {
        model: {
          modelId: "gpt-5.4-robotics-experimental",
        },
      },
    });

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("CONSTRAINT_VIOLATION");
  });

  it("edge disconnect never allows T2/T3 fail-open behavior", async () => {
    const token = issueAndStore();
    const edgeControl: EdgeControlPlanePlugin = {
      checkCentralEscalation: () => ({
        allowed: false,
        reason: "central approval cluster disconnected",
      }),
    };
    const edgeGateway = new PolicyGateway({
      resolveToken: (tokenId) => tokenStore.get(tokenId),
      revocationStore,
      edgeControlPlane: edgeControl,
    });

    const decision = await edgeGateway.intercept({
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: "ros2:///cmd_vel",
      action: "publish",
      params: { linear: { x: 0.1 } },
      physicalContext: { currentVelocityMps: 0.1 },
    });

    expect(decision.action).toBe("deny");
    expect(decision.denial?.policyViolated).toBe("EDGE_CENTRAL_UNAVAILABLE");
  });

  it("multi-fleet conflict path escalates to T3 with approval quorum", async () => {
    const token = issueAndStore({
      resource: "open-rmf://*",
      actions: ["override"],
      constraints: {
        quorum: {
          required: 2,
          authorized: ["ops-lead", "safety-supervisor", "floor-manager"],
        },
      },
    });

    const decision = await gateway.intercept({
      requestId: generateUUIDv7(),
      timestamp: nowISO8601(),
      agentId: agent.publicKey,
      tokenId: token.tokenId,
      resource: rmfDispatchResourceUri("warehouse-fleet"),
      action: rmfOperationToAction("emergency.stop"),
      params: {
        conflictType: "multi-fleet-intersection-deadlock",
        zoneId: "aisle-crossing-z3",
        fleets: ["warehouse-fleet", "loading-fleet"],
      },
    });

    expect(decision.action).toBe("escalate");
    expect(decision.assignedTier).toBe(ApprovalTier.T3_COMMIT);
    expect(decision.escalation?.approvalQuorum).toEqual({
      required: 2,
      authorized: ["ops-lead", "safety-supervisor", "floor-manager"],
    });
  });
});
