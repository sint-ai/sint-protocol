/**
 * Industrial benchmark scenarios aligned with v0.2 adoption goals.
 */

import { describe, expect, it, beforeEach } from "vitest";
import type { SintCapabilityToken, SintCapabilityTokenRequest } from "@sint/core";
import { ApprovalTier } from "@sint/core";
import {
  generateKeypair,
  generateUUIDv7,
  issueCapabilityToken,
  nowISO8601,
  RevocationStore,
} from "@sint/gate-capability-tokens";
import { PolicyGateway } from "@sint/gate-policy-gateway";

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
});
